export class ChatWebSocket {
  private ws: WebSocket | null = null;
  private messageHandler: ((data: any) => void) | null = null;
  private closeHandler: ((event?: CloseEvent) => void) | null = null;
  private openHandler: (() => void) | null = null;
  private pingInterval: number | null = null;

  connect(
    url: string,
    onMessage: (data: any) => void,
    onClose: (event?: CloseEvent) => void,
    onOpen?: () => void
  ) {
    this.messageHandler = onMessage;
    this.closeHandler = onClose;
    this.openHandler = onOpen || null;

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.openHandler?.();
        // Start keepalive heartbeat
        this.pingInterval = window.setInterval(() => {
          this.send({ type: 'ping' });
        }, 25000);
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.messageHandler?.(data);
        } catch (e) {
          console.error('Failed to parse WebSocket JSON message:', e);
        }
      };

      this.ws.onclose = (event) => {
        this.cleanup();
        this.closeHandler?.(event);
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket encountered an error:', error);
      };
    } catch (err) {
      console.error('Failed to instantiate WebSocket:', err);
      this.closeHandler?.();
    }
  }

  send(data: any): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
      return true;
    }
    return false;
  }

  close() {
    this.cleanup();
    if (this.ws) {
      this.ws.close(1000, 'Client closed connection');
      this.ws = null;
    }
  }

  private cleanup() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  isOpen(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}