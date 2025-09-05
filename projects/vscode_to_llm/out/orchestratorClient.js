"use strict";
// Using global fetch (Node.js 18+ in VS Code)
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrchestratorClient = void 0;
class OrchestratorClient {
    constructor(baseUrl = 'http://localhost:4100') {
        this.baseUrl = baseUrl;
    }
    async checkHealth() {
        try {
            const response = await fetch(`${this.baseUrl}/health`);
            return response.ok;
        }
        catch (error) {
            console.error('Health check failed:', error);
            return false;
        }
    }
    async createTask(goal) {
        try {
            const response = await fetch(`${this.baseUrl}/tasks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ goal }),
            });
            return await response.json();
        }
        catch (error) {
            console.error('Failed to create task:', error);
            return null;
        }
    }
    async getTasks() {
        try {
            const response = await fetch(`${this.baseUrl}/tasks`);
            return await response.json();
        }
        catch (error) {
            console.error('Failed to get tasks:', error);
            return [];
        }
    }
    async getTask(id) {
        try {
            const response = await fetch(`${this.baseUrl}/tasks/${id}`);
            return await response.json();
        }
        catch (error) {
            console.error(`Failed to get task ${id}:`, error);
            return null;
        }
    }
    async autodevRun(payload, adminToken) {
        try {
            const headers = { 'Content-Type': 'application/json' };
            if (adminToken)
                headers['Authorization'] = `Bearer ${adminToken}`;
            const response = await fetch(`${this.baseUrl}/admin/autodev_run`, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload)
            });
            const text = await response.text();
            try {
                return JSON.parse(text);
            }
            catch {
                return { ok: false, raw: text };
            }
        }
        catch (error) {
            console.error('Failed to run Auto Dev:', error);
            return { ok: false, error: String(error?.message || error) };
        }
    }
}
exports.OrchestratorClient = OrchestratorClient;
//# sourceMappingURL=orchestratorClient.js.map