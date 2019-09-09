/**
 * Endowments for a Timer device that can be made available to SwingSet vats.
 */

export function buildTimerEndowments() {
  const srcPath = require.resolve('./timer-src');

  let inboundStateAccess;

  function registerInboundStateAccess(state) {
    inboundStateAccess = state;
  }

  // Now might be Date.now(), or it might be a block height.
  function poll(SO, now) {
    const timeAndEvents = inboundStateAccess.removeEventsTo(now);
    timeAndEvents.forEach(events => {
      for (const event of events) {
        try {
          if (event.r) {
            SO(event.callback).wake(event.r);
          } else {
            SO(event.callback).wake();
          }
        } catch (e) {
          if (event.r) {
            event.r.disable();
          }
          // continue to wake other events.
        }
      }
    });
    inboundStateAccess.setLastPolled(now);
  }

  // Functions made available to the host. Endowments are used by the Device
  // itself, while poll() will used by the kernel.
  return {
    srcPath,
    endowments: { registerInboundStateAccess },
    poll,
  };
}
