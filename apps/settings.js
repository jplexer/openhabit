/*
 * The Settings submenu. Reached from the home menu (apps/registry) as
 *   { label: "Settings", make: () => new MenuApp(settings, "settings") }
 * Each entry is { label, make:()=>App }, same shape MenuApp expects everywhere.
 */

import WiFiApp from "apps/WiFiApp";
import DateTimeApp from "apps/DateTimeApp";

const settings = [
  { label: "Wi-Fi", make: () => new WiFiApp() },
  { label: "Date & Time", make: () => new DateTimeApp() },
];

export default settings;
