/*
 * openhabit board provider — the ECMA-419 `device` global for the custom
 * ESP32-S3 bedside clock. Becomes `embedded:provider/builtin` (mapped by
 * $(MODDABLE)/modules/io/manifests/esp32 for esp32/* subplatforms) and is
 * frozen onto globalThis.device by the `system` preload.
 *
 * Pin map is authoritative from ../hwv/HARDWARE.md / ../hwv/main/pins.h.
 * DO NOT guess pins — every value here is a verified net on the board.
 */

import Analog from "embedded:io/analog";
import Digital from "embedded:io/digital";
import DigitalBank from "embedded:io/digitalbank";
import I2C from "embedded:io/i2c";
import PulseCount from "embedded:io/pulsecount";
import PWM from "embedded:io/pwm";
import SMBus from "embedded:io/smbus";
import SPI from "embedded:io/spi";
import DS3231 from "embedded:RTC/DS3231";

const device = {
  // I2C0: DS3231 RTC @0x68
  I2C: {
    default: {
      io: I2C,
      data: 45,
      clock: 46,
    },
  },

  SPI: {
    default: {
      io: SPI,
      clock: 12, // EPD_SCK
      out: 11, // EPD_MOSI / SDI
      port: 1, // SPI2_HOST
    },
  },

  //Battery sense on GPIO2 (ADC1_CH1).
  Analog: {
    default: {
      io: Analog,
      pin: 2,
    },
  },

  io: { Analog, Digital, DigitalBank, I2C, PulseCount, PWM, SMBus, SPI },

  // Named pins
  pin: {
    // e-ink display (UC8253, GDEY037T03)
    epdMOSI: 11,
    epdSCK: 12,
    epdSelect: 10, // CS, active low
    epdDC: 9, // 0 = command, 1 = data
    epdReset: 16, // active low
    epdBusy: 4, // LOW = busy, HIGH = idle

    // I2C bus + RTC interrupt
    i2cSDA: 45,
    i2cSCL: 46,
    rtcInterrupt: 3,

    // lights (LEDC PWM)
    lightFront: 18,
    lightBig: 17,

    // audio (MAX98357A I2S amp)
    i2sDIN: 38, // ESP32-S3 data out -> amp DIN
    i2sLRCLK: 39,
    i2sBCLK: 40,
    amplifierEnable: 41, // SD/enable: drive HIGH to un-mute

    // buttons (active low, internal pull-up)
    buttonBig: 44,
    buttonOrange: 15,

    // rotary encoder + push switch
    encoderA: 47,
    encoderB: 48,
    encoderButton: 21, // active low, internal pull-up

    // battery sense
    battery: 2,

    // SD card (SDMMC 4-bit) (no support yet)
    sdCMD: 5,
    sdCLK: 6,
    sdD0: 7,
    sdD1: 8,
    sdD2: 14,
    sdD3: 13,
  },

  peripheral: {
    RTC: class {
      constructor(options) {
        return new DS3231({
          ...options,
          clock: {
            ...device.I2C.default,
            io: SMBus,
          },
        });
      }
    },

    Encoder: class {
      constructor(options) {
        return new PulseCount({
          ...options,
          signal: device.pin.encoderB,
          control: device.pin.encoderA,
        });
      }
    },
  },
};

export default device;
