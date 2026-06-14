import AboutApp from "apps/AboutApp";
import MenuApp from "apps/MenuApp";
import settings from "apps/settings";
import FilesApp from "apps/FilesApp";

const registry = [
  { label: "Settings", make: () => new MenuApp(settings, "settings") },
  { label: "Files", make: () => new FilesApp() },
  { label: "About", make: () => new AboutApp() },
];

export default registry;
