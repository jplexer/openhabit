import Manager from "core/Manager";
import Input from "core/Input";
import Net from "core/Net";
import Backlight from "core/Backlight";
import Light from "core/Light";
import Alarms from "core/Alarms";
import ClockApp from "apps/ClockApp";
import AlarmRingApp from "apps/AlarmRingApp";
import Timer from "timer";

const SPLASH_MS = 2000; // keep the boot screen up while IO/RTC settle

// shared services handed to every app as `ctx.<name>`
const rtc = new device.peripheral.RTC({});
const net = new Net({ rtc });
const backlight = new Backlight(); // front light: auto on interaction
const bigLight = new Light(device.pin.lightBig, "bigBrightness", 100); // manual (orange on clock)
const alarms = new Alarms({ rtc, net, bigLight, makeRing: (a) => new AlarmRingApp(a) });
const services = { rtc, net, backlight, bigLight, alarms };

const manager = new Manager(services);
manager.splash(); // boot screen, shown until the home app is ready
backlight.wake(Date.now()); // light up at boot; times out if left idle

const input = new Input();
Timer.delay(SPLASH_MS); // hold the splash before the home app takes over

manager.push(new ClockApp()); // replaces the boot screen with the home app
manager.start(input);

net.boot(); // start Wi-Fi auto-connect + time sync in the background
alarms.boot(); // load saved alarms; the Manager loop checks them

trace("openhabit: app manager started\n");
