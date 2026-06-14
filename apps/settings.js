/*
 * The Settings submenu. Reached from the home menu (apps/registry) as
 *   { label: "Settings", make: () => new MenuApp(settings, "settings") }
 * Each entry is { label, make:()=>App }, same shape MenuApp expects everywhere.
 */

import WiFiApp from "apps/WiFiApp";
import DateTimeApp from "apps/DateTimeApp";
import LightingApp from "apps/LightingApp";

const settings = [
  { label: "Wi-Fi", make: () => new WiFiApp() },
  { label: "Date & Time", make: () => new DateTimeApp() },
  { label: "Lighting", make: () => new LightingApp() },
];

export default settings;
