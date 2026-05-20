import { EventEmitter } from "node:events";

export type AnnouncementEvent = "changed";

class AnnouncementEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(0);
  }

  notifyChanged(): void {
    this.emit("changed");
  }
}

export const announcementEvents = new AnnouncementEventBus();
