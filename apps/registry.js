import AboutApp from "apps/AboutApp";
import MenuApp from "apps/MenuApp";
import settings from "apps/settings";

const registry = [
  { label: "Settings", make: () => new MenuApp(settings, "settings") },
  { label: "About", make: () => new AboutApp() },
];

export default registry;
