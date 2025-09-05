#!/usr/bin/env python3
"""
LM Studio Tuner GUI

Simple Python GUI to connect to an OpenAI-compatible LM Studio endpoint,
select a model, adjust sampling/preset parameters, and test prompts for
quality and latency. Keeps scope minimal and focused on parameter tuning.

Run:
  python tools/lmstudio_tuner_gui.py

Features:
- Endpoint + API key input, model dropdown (auto-populated)
- Presets: Creative, Balanced, Precise, Deterministic, Coding
- Parameters: temperature, top_p, presence_penalty, frequency_penalty,
  repetition_penalty, max_tokens
- Prompt format: None, Llama 3, ChatML, Mistral
- System prompt and user prompt editors
- Output viewer with latency + token estimates
"""
from __future__ import annotations

import json
import time
import threading
from dataclasses import dataclass
from typing import Any, Dict, List, Optional
from pathlib import Path

import tkinter as tk
from tkinter import ttk, scrolledtext, messagebox
from tkinter import simpledialog

import requests


# ===== Utilities =====

def estimate_tokens(text: str) -> int:
    if not text:
        return 0
    # Rough heuristic: ~4 chars per token
    return max(1, int(len(text) / 4.0))


def apply_prompt_format(messages: List[Dict[str, str]], format_type: str = "None") -> List[Dict[str, str]]:
    if not messages or not format_type or format_type.lower() == "none":
        return messages

    system_prompt = "You are a helpful assistant."
    chat_messages = messages
    if messages and messages[0].get("role") == "system":
        system_prompt = messages[0].get("content", system_prompt)
        chat_messages = messages[1:]

    fmt = (format_type or "").strip().lower()

    if fmt in ("llama 3", "llama3", "llama-3"):
        prompt_str = f"<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n{system_prompt}<|eot_id|>"
        for msg in chat_messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            prompt_str += f"<|start_header_id|>{role}<|end_header_id|>\n\n{content}<|eot_id|>"
        prompt_str += "<|start_header_id|>assistant<|end_header_id|>\n\n"
        return [{"role": "user", "content": prompt_str}]

    if fmt == "chatml":
        prompt_str = f"<|im_start|>system\n{system_prompt}<|im_end|>\n"
        for msg in chat_messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            prompt_str += f"<|im_start|>{role}\n{content}<|im_end|>\n"
        prompt_str += "<|im_start|>assistant\n"
        return [{"role": "user", "content": prompt_str}]

    if fmt in ("mistral", "mixtral"):
        prompt_str = "<s>"
        effective_messages = list(chat_messages)
        if system_prompt and effective_messages:
            if effective_messages[0].get('role') == 'user':
                effective_messages[0]['content'] = f"{system_prompt}\n\n{effective_messages[0].get('content','')}"
        for m in effective_messages:
            role = m.get('role')
            if role == 'user':
                prompt_str += f"[INST] {m.get('content','')} [/INST]"
            elif role == 'assistant':
                prompt_str += f"{m.get('content','')}</s>"
        return [{"role": "user", "content": prompt_str}]

    return messages


PRESETS: Dict[str, Dict[str, Any]] = {
    "Creative": {"temperature": 1.1, "top_p": 0.95, "presence_penalty": 0.1, "frequency_penalty": 0.0, "repetition_penalty": 1.0},
    "Balanced": {"temperature": 0.7, "top_p": 0.9, "presence_penalty": 0.0, "frequency_penalty": 0.0, "repetition_penalty": 1.05},
    "Precise": {"temperature": 0.3, "top_p": 0.85, "presence_penalty": 0.0, "frequency_penalty": 0.0, "repetition_penalty": 1.1},
    "Deterministic": {"temperature": 0.0, "top_p": 1.0, "presence_penalty": 0.0, "frequency_penalty": 0.0, "repetition_penalty": 1.0},
    "Coding": {"temperature": 0.15, "top_p": 0.9, "presence_penalty": -0.1, "frequency_penalty": 0.1, "repetition_penalty": 1.15},
}


@dataclass
class RequestParams:
    endpoint: str
    api_key: str
    model: str
    temperature: float
    top_p: float
    presence_penalty: float
    frequency_penalty: float
    repetition_penalty: float
    max_tokens: int
    format_type: str
    system_prompt: str
    user_prompt: str


class LMStudioTunerGUI:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("LM Studio Tuner")
        self.root.geometry("1000x700")

        self._build_ui()
        self._bind_events()

        # Initial load models
        self.refresh_models()

    def _build_ui(self):
        pad = {"padx": 6, "pady": 4}

        # Connection frame
        conn = ttk.LabelFrame(self.root, text="Connection")
        conn.pack(fill="x", **pad)
        ttk.Label(conn, text="Endpoint").grid(row=0, column=0, sticky="w", **pad)
        self.endpoint_var = tk.StringVar(value="http://localhost:1234")
        ttk.Entry(conn, textvariable=self.endpoint_var, width=50).grid(row=0, column=1, sticky="we", **pad, columnspan=3)
        ttk.Label(conn, text="API Key").grid(row=0, column=4, sticky="e", **pad)
        self.api_key_var = tk.StringVar(value="")
        ttk.Entry(conn, textvariable=self.api_key_var, width=30, show="*").grid(row=0, column=5, sticky="we", **pad)
        self.refresh_btn = ttk.Button(conn, text="Refresh Models", command=self.refresh_models)
        self.refresh_btn.grid(row=0, column=6, **pad)
        conn.grid_columnconfigure(1, weight=1)

        # Model + presets frame
        mdl = ttk.LabelFrame(self.root, text="Model & Presets")
        mdl.pack(fill="x", **pad)
        ttk.Label(mdl, text="Model").grid(row=0, column=0, sticky="w", **pad)
        self.model_var = tk.StringVar()
        self.model_combo = ttk.Combobox(mdl, textvariable=self.model_var, values=[], width=50, state="readonly")
        self.model_combo.grid(row=0, column=1, sticky="we", **pad, columnspan=3)

        ttk.Label(mdl, text="Preset").grid(row=0, column=4, sticky="e", **pad)
        self.preset_var = tk.StringVar(value="Coding")
        self.preset_combo = ttk.Combobox(mdl, textvariable=self.preset_var, values=list(PRESETS.keys()), state="readonly", width=18)
        self.preset_combo.grid(row=0, column=5, sticky="we", **pad)
        self.apply_preset_btn = ttk.Button(mdl, text="Apply", command=self.apply_preset)
        self.apply_preset_btn.grid(row=0, column=6, **pad)
        self.save_preset_btn = ttk.Button(mdl, text="Save", command=self.save_preset_dialog)
        self.save_preset_btn.grid(row=0, column=7, **pad)
        self.load_preset_btn = ttk.Button(mdl, text="Load", command=self.load_preset_dialog)
        self.load_preset_btn.grid(row=0, column=8, **pad)
        self.manage_preset_btn = ttk.Button(mdl, text="Manage", command=self.open_preset_manager)
        self.manage_preset_btn.grid(row=0, column=9, **pad)
        mdl.grid_columnconfigure(1, weight=1)

        # Parameters frame
        prm = ttk.LabelFrame(self.root, text="Parameters")
        prm.pack(fill="x", **pad)

        def add_param(row: int, label: str, var: tk.DoubleVar, from_, to_, resolution, default):
            ttk.Label(prm, text=label).grid(row=row, column=0, sticky="w", **pad)
            scale = ttk.Scale(prm, variable=var, from_=from_, to=to_, orient="horizontal")
            scale.grid(row=row, column=1, sticky="we", **pad)
            entry = ttk.Entry(prm, textvariable=var, width=8)
            entry.grid(row=row, column=2, sticky="w", **pad)
            var.set(default)

        self.temp_var = tk.DoubleVar()
        self.top_p_var = tk.DoubleVar()
        self.presence_var = tk.DoubleVar()
        self.frequency_var = tk.DoubleVar()
        self.repetition_var = tk.DoubleVar()
        add_param(0, "temperature", self.temp_var, 0.0, 2.0, 0.01, 0.7)
        add_param(1, "top_p", self.top_p_var, 0.0, 1.0, 0.01, 0.9)
        add_param(2, "presence_penalty", self.presence_var, -2.0, 2.0, 0.01, 0.0)
        add_param(3, "frequency_penalty", self.frequency_var, -2.0, 2.0, 0.01, 0.0)
        add_param(4, "repetition_penalty", self.repetition_var, 0.5, 1.5, 0.01, 1.05)

        ttk.Label(prm, text="max_tokens").grid(row=0, column=3, sticky="e", **pad)
        self.max_tokens_var = tk.IntVar(value=800)
        ttk.Spinbox(prm, from_=16, to=8192, textvariable=self.max_tokens_var, width=8).grid(row=0, column=4, sticky="w", **pad)

        ttk.Label(prm, text="format").grid(row=1, column=3, sticky="e", **pad)
        self.format_var = tk.StringVar(value="None")
        self.format_combo = ttk.Combobox(prm, textvariable=self.format_var, values=["None", "Llama 3", "ChatML", "Mistral"], state="readonly", width=10)
        self.format_combo.grid(row=1, column=4, sticky="w", **pad)

        prm.grid_columnconfigure(1, weight=1)

        # Prompts frame
        pfrm = ttk.LabelFrame(self.root, text="Prompts")
        pfrm.pack(fill="both", expand=True, **pad)
        ttk.Label(pfrm, text="System prompt").grid(row=0, column=0, sticky="w", **pad)
        self.system_txt = scrolledtext.ScrolledText(pfrm, height=4)
        self.system_txt.grid(row=1, column=0, columnspan=3, sticky="nsew", **pad)
        self.system_txt.insert("1.0", "You are an expert programming assistant. Provide correct, runnable code with proper complexity analysis and clear explanations. Always include working examples and unit tests when relevant.")

        ttk.Label(pfrm, text="User prompt").grid(row=2, column=0, sticky="w", **pad)
        self.user_txt = scrolledtext.ScrolledText(pfrm, height=8)
        self.user_txt.grid(row=3, column=0, columnspan=3, sticky="nsew", **pad)
        self.user_txt.insert("1.0", "Implement breadth-first search (BFS) and depth-first search (DFS) algorithms for graph traversal. Include:\n1. Complete Python implementations for both recursive and iterative versions\n2. Correct time and space complexity analysis\n3. Working example with a sample graph\n4. Clear comments explaining the algorithms")

        pfrm.grid_rowconfigure(1, weight=1)
        pfrm.grid_rowconfigure(3, weight=1)
        pfrm.grid_columnconfigure(0, weight=1)

        # Actions
        act = ttk.Frame(self.root)
        act.pack(fill="x", **pad)
        self.run_btn = ttk.Button(act, text="Generate", command=self.generate)
        self.run_btn.pack(side="left")
        self.stop_btn = ttk.Button(act, text="Stop", command=self.request_stop, state="disabled")
        self.stop_btn.pack(side="left", padx=6)
        self.status_var = tk.StringVar(value="Ready")
        ttk.Label(act, textvariable=self.status_var).pack(side="right")

        # Output
        out = ttk.LabelFrame(self.root, text="Output")
        out.pack(fill="both", expand=True, **pad)
        self.output_txt = scrolledtext.ScrolledText(out, height=12)
        self.output_txt.pack(fill="both", expand=True)

        # Internal state
        self._stop_flag = threading.Event()
        # Apply initial preset
        try:
            self.apply_preset()
        except Exception:
            pass

    def _bind_events(self):
        self.preset_combo.bind("<<ComboboxSelected>>", lambda e: self.apply_preset())

    def apply_preset(self):
        preset = PRESETS.get(self.preset_var.get(), {})
        if not preset:
            return
        self.temp_var.set(preset.get("temperature", 0.7))
        self.top_p_var.set(preset.get("top_p", 0.9))
        self.presence_var.set(preset.get("presence_penalty", 0.0))
        self.frequency_var.set(preset.get("frequency_penalty", 0.0))
        self.repetition_var.set(preset.get("repetition_penalty", 1.05))
        self.status_var.set(f"Applied preset: {self.preset_var.get()}")

    def _collect_params(self) -> Optional[RequestParams]:
        endpoint = self.endpoint_var.get().strip()
        api_key = self.api_key_var.get().strip()
        model = self.model_var.get().strip()
        if not endpoint:
            messagebox.showerror("Validation", "Endpoint is required")
            return None
        if not model:
            messagebox.showerror("Validation", "Model is required (click Refresh Models)")
            return None
        return RequestParams(
            endpoint=endpoint,
            api_key=api_key,
            model=model,
            temperature=float(self.temp_var.get()),
            top_p=float(self.top_p_var.get()),
            presence_penalty=float(self.presence_var.get()),
            frequency_penalty=float(self.frequency_var.get()),
            repetition_penalty=float(self.repetition_var.get()),
            max_tokens=int(self.max_tokens_var.get()),
            format_type=self.format_var.get(),
            system_prompt=self.system_txt.get("1.0", "end").strip(),
            user_prompt=self.user_txt.get("1.0", "end").strip(),
        )

    def refresh_models(self):
        endpoint = self.endpoint_var.get().strip()
        if not endpoint:
            return
        self.status_var.set("Fetching models...")
        self.root.update_idletasks()
        try:
            url = f"{endpoint.rstrip('/')}/v1/models"
            headers = {"Content-Type": "application/json"}
            api_key = self.api_key_var.get().strip()
            if api_key:
                headers["Authorization"] = f"Bearer {api_key}"
            resp = requests.get(url, headers=headers, timeout=10)
            resp.raise_for_status()
            data = resp.json() or {}
            models = [m.get("id", "") for m in data.get("data", []) if isinstance(m, dict)]
            self.model_combo.configure(values=models)
            if models and not self.model_var.get():
                self.model_var.set(models[0])
            self.status_var.set(f"Loaded {len(models)} models")
        except Exception as e:
            self.status_var.set("Model fetch failed")
            messagebox.showerror("Models", f"Failed to fetch models: {e}")

    def request_stop(self):
        self._stop_flag.set()

    def _do_generate(self, params: RequestParams):
        self._stop_flag.clear()
        self.run_btn.configure(state="disabled")
        self.stop_btn.configure(state="normal")
        self.output_txt.delete("1.0", "end")
        self.status_var.set("Generating...")
        self.root.update_idletasks()

        try:
            messages: List[Dict[str, str]] = []
            if params.system_prompt:
                messages.append({"role": "system", "content": params.system_prompt})
            messages.append({"role": "user", "content": params.user_prompt})
            formatted_messages = apply_prompt_format(messages, params.format_type)

            url = f"{params.endpoint.rstrip('/')}/v1/chat/completions"
            headers = {"Content-Type": "application/json"}
            if params.api_key:
                headers["Authorization"] = f"Bearer {params.api_key}"

            payload = {
                "model": params.model,
                "messages": formatted_messages,
                "temperature": params.temperature,
                "top_p": params.top_p,
                "presence_penalty": params.presence_penalty,
                "frequency_penalty": params.frequency_penalty,
                "repetition_penalty": params.repetition_penalty,
                "max_tokens": params.max_tokens,
            }

            t0 = time.time()
            resp = requests.post(url, json=payload, headers=headers, timeout=300)
            resp.raise_for_status()
            t1 = time.time()
            data = resp.json()
            content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            elapsed = t1 - t0
            toks = estimate_tokens(content)
            tps = toks / max(elapsed, 1e-6)

            self.output_txt.insert("end", content)
            self.status_var.set(f"Done in {elapsed:.2f}s | ~{toks} toks | {tps:.1f} tok/s")

        except Exception as e:
            self.status_var.set("Error")
            messagebox.showerror("Generate", f"Request failed: {e}")
        finally:
            self.run_btn.configure(state="normal")
            self.stop_btn.configure(state="disabled")

    def generate(self):
        params = self._collect_params()
        if not params:
            return
        # Run in a thread to keep UI responsive
        threading.Thread(target=self._do_generate, args=(params,), daemon=True).start()

    # ===== Preset Save/Load =====
    def _presets_path(self) -> Path:
        return Path('.autodev') / 'presets.json'

    def _gather_current_settings(self) -> Dict[str, Any]:
        return {
            "temperature": float(self.temp_var.get()),
            "top_p": float(self.top_p_var.get()),
            "presence_penalty": float(self.presence_var.get()),
            "frequency_penalty": float(self.frequency_var.get()),
            "repetition_penalty": float(self.repetition_var.get()),
            "max_tokens": int(self.max_tokens_var.get()),
            "format_type": self.format_var.get(),
            "system_prompt": self.system_txt.get("1.0", "end").strip(),
            "user_prompt": self.user_txt.get("1.0", "end").strip(),
        }

    def _apply_settings(self, data: Dict[str, Any]) -> None:
        try:
            if "temperature" in data: self.temp_var.set(float(data["temperature"]))
            if "top_p" in data: self.top_p_var.set(float(data["top_p"]))
            if "presence_penalty" in data: self.presence_var.set(float(data["presence_penalty"]))
            if "frequency_penalty" in data: self.frequency_var.set(float(data["frequency_penalty"]))
            if "repetition_penalty" in data: self.repetition_var.set(float(data["repetition_penalty"]))
            if "max_tokens" in data: self.max_tokens_var.set(int(data["max_tokens"]))
            if "format_type" in data: self.format_var.set(str(data["format_type"]))
            if "system_prompt" in data: self.system_txt.delete("1.0", "end"); self.system_txt.insert("1.0", str(data["system_prompt"]))
            if "user_prompt" in data: self.user_txt.delete("1.0", "end"); self.user_txt.insert("1.0", str(data["user_prompt"]))
            self.status_var.set("Preset applied")
        except Exception as e:
            messagebox.showerror("Preset", f"Failed to apply preset: {e}")

    def save_preset_dialog(self):
        name = simpledialog.askstring("Save Preset", "Preset name:")
        if not name:
            return
        path = self._presets_path()
        try:
            data: Dict[str, Any] = {}
            if path.exists():
                with path.open('r', encoding='utf-8') as f:
                    data = json.load(f) or {}
            else:
                path.parent.mkdir(parents=True, exist_ok=True)
            data[name] = self._gather_current_settings()
            with path.open('w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            self.status_var.set(f"Saved preset: {name}")
        except Exception as e:
            messagebox.showerror("Save Preset", f"Failed to save preset: {e}")

    def load_preset_dialog(self):
        path = self._presets_path()
        try:
            if not path.exists():
                messagebox.showinfo("Load Preset", "No presets found.")
                return
            with path.open('r', encoding='utf-8') as f:
                data: Dict[str, Any] = json.load(f) or {}
            if not data:
                messagebox.showinfo("Load Preset", "No presets found.")
                return
            names = ", ".join(sorted(data.keys()))
            name = simpledialog.askstring("Load Preset", f"Enter preset name to load:\nAvailable: {names}")
            if not name:
                return
            if name not in data:
                messagebox.showerror("Load Preset", f"Preset not found: {name}")
                return
            self._apply_settings(data[name])
        except Exception as e:
            messagebox.showerror("Load Preset", f"Failed to load preset: {e}")

    # ===== Preset Manager (list/apply/rename/delete) =====
    def open_preset_manager(self):
        path = self._presets_path()
        presets: Dict[str, Any] = {}
        try:
            if path.exists():
                with path.open('r', encoding='utf-8') as f:
                    presets = json.load(f) or {}
        except Exception as e:
            messagebox.showerror("Preset Manager", f"Failed to load presets: {e}")
            return

        win = tk.Toplevel(self.root)
        win.title("Preset Manager")
        win.geometry("520x360")

        frame = ttk.Frame(win, padding=(8, 8))
        frame.pack(fill="both", expand=True)

        ttk.Label(frame, text="Presets").pack(anchor="w")
        listbox = tk.Listbox(frame, height=10)
        listbox.pack(fill="both", expand=True)

        for name in sorted(presets.keys()):
            listbox.insert("end", name)

        btns = ttk.Frame(frame)
        btns.pack(fill="x", pady=6)

        def refresh_list():
            listbox.delete(0, "end")
            try:
                with path.open('r', encoding='utf-8') as f:
                    data = json.load(f) or {}
            except Exception:
                data = {}
            for nm in sorted(data.keys()):
                listbox.insert("end", nm)

        def get_selected_name() -> Optional[str]:
            try:
                idx = listbox.curselection()
                if not idx:
                    return None
                return listbox.get(idx[0])
            except Exception:
                return None

        def apply_selected():
            name = get_selected_name()
            if not name:
                return
            try:
                with path.open('r', encoding='utf-8') as f:
                    data = json.load(f) or {}
                self._apply_settings(data.get(name, {}))
            except Exception as e:
                messagebox.showerror("Preset Manager", f"Failed to apply: {e}")

        def rename_selected():
            name = get_selected_name()
            if not name:
                return
            new_name = simpledialog.askstring("Rename Preset", f"Rename '{name}' to:")
            if not new_name or new_name == name:
                return
            try:
                with path.open('r', encoding='utf-8') as f:
                    data = json.load(f) or {}
                if new_name in data:
                    messagebox.showerror("Preset Manager", "A preset with that name already exists")
                    return
                data[new_name] = data.pop(name)
                with path.open('w', encoding='utf-8') as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)
                refresh_list()
            except Exception as e:
                messagebox.showerror("Preset Manager", f"Failed to rename: {e}")

        def delete_selected():
            name = get_selected_name()
            if not name:
                return
            if not messagebox.askyesno("Delete Preset", f"Delete preset '{name}'?"):
                return
            try:
                with path.open('r', encoding='utf-8') as f:
                    data = json.load(f) or {}
                if name in data:
                    del data[name]
                with path.open('w', encoding='utf-8') as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)
                refresh_list()
            except Exception as e:
                messagebox.showerror("Preset Manager", f"Failed to delete: {e}")

        ttk.Button(btns, text="Apply", command=apply_selected).pack(side="left")
        ttk.Button(btns, text="Rename", command=rename_selected).pack(side="left", padx=6)
        ttk.Button(btns, text="Delete", command=delete_selected).pack(side="left")
        ttk.Button(btns, text="Close", command=win.destroy).pack(side="right")


def main():
    root = tk.Tk()
    style = ttk.Style(root)
    try:
        style.theme_use("clam")
    except Exception:
        pass
    LMStudioTunerGUI(root)
    root.mainloop()


if __name__ == "__main__":
    main()
