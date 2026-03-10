export class DaemonDispatcher {
  constructor({ onTriggered } = {}) {
    this.onTriggeredHandler = onTriggered;
  }

  async onTriggered(event) {
    await this.onTriggeredHandler?.(event);
  }
}
