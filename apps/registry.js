import AboutApp from "apps/AboutApp";

const registry = [
  { label: "About", make: () => new AboutApp() },
  // { label: "Timer",   make: () => new TimerApp() },
  // { label: "Settings", make: () => new SettingsApp() },
];

export default registry;
