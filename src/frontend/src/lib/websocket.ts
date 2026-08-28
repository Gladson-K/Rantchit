export class ChatWebSocket {
  private ws: WebSocket | null = null;
  private messageHandler: ((data: any) => void) | null = null;
  private closeHandler: (() => void) | null = null;

  connect(url: string, onMessage: (data: any) => void, onClose: () => void) {
    this.messageHandler = onMessage;
    this.closeHandler = onClose;
    this.ws = new WebSocket(url);
    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.messageHandler?.(data);
    };
    this.ws.onclose = () => {
      this.closeHandler?.();
    };
    this.ws.onerror = (error) => {
      console.error('WebSocket error', error);
    };
  }

  send(data: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  close() {
    this.ws?.close();
  }
}