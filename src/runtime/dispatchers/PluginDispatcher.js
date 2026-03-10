export class PluginDispatcher {
  constructor({ runtime }) {
    this.runtime = runtime;
  }

  async onTriggered(event) {
    if (!this.runtime?.dispatchReply) {
      return;
    }
    await this.runtime.dispatchReply({
      text: event?.payload?.message || '',
      metadata: {
        source: 'watch.triggered',
        event
      }
    });
  }
}
