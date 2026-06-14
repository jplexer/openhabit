/*
 * The Settings submenu. Reached from the home menu (apps/registry) as
 *   { label: "Settings", make: () => new MenuApp(settings, "settings") }
 * Each entry is { label, make:()=>App }, same shape MenuApp expects everywhere.
 */

import WiFiApp from "apps/WiFiApp";
import DateTimeApp from "apps/DateTimeApp";
import LightingApp from "apps/LightingApp";
import VolumeApp from "apps/VolumeApp";

const settings = [
  { label: "Wi-Fi", make: () => new WiFiApp() },
  { label: "Date & Time", make: () => new DateTimeApp() },
  { label: "Front light", make: () => new LightingApp("backlight", "front light") },
  { label: "Big light", make: () => new LightingApp("bigLight", "big light") },
  { label: "Volume", make: () => new VolumeApp() },
];

export default settings;
