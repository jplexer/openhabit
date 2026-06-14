import Manager from "core/Manager";
import Input from "core/Input";
import ClockApp from "apps/ClockApp";
import Timer from "timer";

const SPLASH_MS = 2000; // keep the boot screen up while IO/RTC settle

// shared services handed to every app as `ctx.<name>`
const services = {
  rtc: new device.peripheral.RTC({}),
};

const manager = new Manager(services);
manager.splash(); // boot screen, shown until the home app is ready

const input = new Input();
Timer.delay(SPLASH_MS); // hold the splash before the home app takes over

manager.push(new ClockApp()); // replaces the boot screen with the home app
manager.start(input);

trace("openhabit: app manager started\n");
