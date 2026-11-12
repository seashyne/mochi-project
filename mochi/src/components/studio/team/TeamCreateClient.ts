// Reconnecting WebSocket transport for a live Team Create room. The transport
// knows nothing about documents: it only delivers JSON messages and status.

export type TeamConnectionStatus = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'closed';

export interface TeamClientOptions {
  url: string;
  onMessage: (message: Record<string, unknown>) => void;
  onStatus: (status: TeamConnectionStatus) => void;
  heartbeatMs?: number;
  maxRetryDelayMs?: number;
}

export class TeamCreateClient {
  private socket: WebSocket | null = null;
  private status: TeamConnectionStatus = 'idle';
  private closed = false;
  private retries = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly options: TeamClientOptions) {}

  public connect(): void {
    if (this.closed || typeof WebSocket === 'undefined') {
      this.setStatus('closed');
      return;
    }
    this.clearRetry();
    this.setStatus(this.retries > 0 ? 'reconnecting' : 'connecting');
    try {
      this.socket = new WebSocket(this.options.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    const socket = this.socket;
    socket.onopen = () => {
      this.retries = 0;
      this.setStatus('live');
      this.startHeartbeat();
    };
    socket.onmessage = (event: MessageEvent) => {
      if (typeof event.data !== 'string') return;
      try {
        const parsed = JSON.parse(event.data) as Record<string, unknown>;
        if (parsed && typeof parsed === 'object') this.options.onMessage(parsed);
      } catch {
        // Ignore malformed frames from the room.
      }
    };
    socket.onerror = () => { /* close event drives reconnection */ };
    socket.onclose = () => {
      this.stopHeartbeat();
      if (this.closed) {
        this.setStatus('closed');
        return;
      }
      this.scheduleReconnect();
    };
  }

  public send(payload: unknown): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    try {
      this.socket.send(JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  public isOpen(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }

  public getStatus(): TeamConnectionStatus {
    return this.status;
  }

  public close(): void {
    this.closed = true;
    this.clearRetry();
    this.stopHeartbeat();
    if (this.socket) {
      try { this.socket.close(); } catch { /* already closed */ }
      this.socket = null;
    }
    this.setStatus('closed');
  }

  private scheduleReconnect(): void {
    this.clearRetry();
    this.retries += 1;
    const max = this.options.maxRetryDelayMs ?? 8000;
    const delay = Math.min(500 * 2 ** (this.retries - 1), max);
    this.setStatus('reconnecting');
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, delay);
  }

  private clearRetry(): void {
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    const interval = this.options.heartbeatMs ?? 15000;
    this.heartbeat = setInterval(() => { this.send({ kind: 'ping' }); }, interval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeat !== null) clearInterval(this.heartbeat);
    this.heartbeat = null;
  }

  private setStatus(status: TeamConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.options.onStatus(status);
  }
}
