// A vat to wrap the Timer device and provide access to scheduling resources.

export async function doTimerVatBootstrap(D, E, vats, devices) {
  E(vats.timer).registerTimerDevice(devices.timer);
}
