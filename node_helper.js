// 'use strict';

/* Magic Mirror
* Module: MMM-PIR-Sensor
*
* By Paul-Vincent Roll http://paulvincentroll.com
* MIT Licensed.
*/

const NodeHelper = require('node_helper');
const Gpio = require('onoff').Gpio;
const exec = require('child_process').exec;
var alexaControl = false; // false is normal operation, true means only Alexa can resume operation
var mirrorStatus = true; // true is on, false is off

module.exports = NodeHelper.create({
    start: function () {
        this.started = false;
    },

    wait: function(delay) {
	// delay is milliseconds to wait
	var start = new Date().getTime();
	var end = start;
	while(end < start + delay) {
	    end = new Date().getTime();
	}
    },

    activateMonitor: function () {
        // If always-off is enabled, keep monitor deactivated
        let alwaysOffTrigger = this.alwaysOff && (this.alwaysOff.readSync() === this.config.alwaysOffState)
        if (alwaysOffTrigger) {
            return;
        }
        // If relays are being used in place of HDMI
        if ((this.config.relayPin !== false) && !alexaControl && !mirrorStatus) {
	    console.log("Activating monitor");
	    this.relay.writeSync(this.config.relayState);
	    this.wait(3500);
	    this.relay.writeSync((this.config.relayState + 1) % 2);
	    mirrorStatus = true;
	    this.wait(6500);
        }
        else if (this.config.relayPin === false) {
            // Check if hdmi output is already on
            exec("/usr/bin/vcgencmd display_power").stdout.on('data', function(data) {
                if (data.indexOf("display_power=0") === 0)
                    exec("/usr/bin/vcgencmd display_power 1", null);
            });
        }
    },

    deactivateMonitor: function () {
        // If always-on is enabled, keep monitor activated
        let alwaysOnTrigger = this.alwaysOn && (this.alwaysOn.readSync() === this.config.alwaysOnState)
        let alwaysOffTrigger = this.alwaysOff && (this.alwaysOff.readSync() === this.config.alwaysOffState)
        if (alwaysOnTrigger && !alwaysOffTrigger) {
            return;
        }
        // If relays are being used in place of HDMI
        if ((this.config.relayPin !== false) && !alexaControl && mirrorStatus) {
	    console.log("Deactivating monitor");
	    this.relay.writeSync(this.config.relayState);
	    this.wait(3500);
	    this.relay.writeSync((this.config.relayState + 1) % 2);
	    mirrorStatus = false;
	    this.wait(6500);
        }
        else if (this.config.relayPin === false) {
            exec("/usr/bin/vcgencmd display_power 0", null);
        }
    },

    // Subclass socketNotificationReceived received.
    socketNotificationReceived: function (notification, payload) {
	console.log("PIR notification in socket: " + notification);
        if (notification === "CONFIG" && this.started == false) {
            const self = this;
            this.config = payload;

            // Setup for relay pin
            if (this.config.relayPin) {
                this.relay = new Gpio(this.config.relayPin, 'out');
                //this.relay.writeSync((this.config.relayState + 1) % 2);
                exec("/usr/bin/vcgencmd display_power 1", null);
            }

            // Setup for alwaysOn switch
            if (this.config.alwaysOnPin) {
                this.alwaysOn = new Gpio(this.config.alwaysOnPin, 'in', 'both');
                const alwaysOnState = this.config.alwaysOnState
                this.alwaysOn.watch(function (err, value) {
                    if (value === alwaysOnState) {
                        self.sendSocketNotification('ALWAYS_ON', true);
                        self.sendSocketNotification('SHOW_ALERT', {
                            title: 'Always-On Activated',
                            message: 'Mirror will not activate power-saving mode',
                            timer: 4000
                        });
                        if (self.config.powerSaving){
                            clearTimeout(self.deactivateMonitorTimeout);
                        }
                    } else if (value === (alwaysOnState + 1) % 2) {
                        self.sendSocketNotification('ALWAYS_ON', false);
                        self.sendSocketNotification('SHOW_ALERT', {
                            title: 'Always-On Deactivated',
                            message: 'Mirror will now use motion sensor to activate',
                            timer: 4000
                        });
                    }
                })
            }

            // Setup for alwaysOff switch
            if (this.config.alwaysOffPin) {
                this.alwaysOff = new Gpio(this.config.alwaysOffPin, 'in', 'both');
                const alwaysOffState = this.config.alwaysOffState
                this.alwaysOff.watch(function (err, value) {
                    if (value === alwaysOffState) {
                        self.sendSocketNotification('ALWAYS_OFF', true);
                        self.deactivateMonitor();
                    } else if (value === (alwaysOffState + 1) % 2) {
                        self.sendSocketNotification('ALWAYS_OFF', false);
                        self.activateMonitor();
                        if (self.config.powerSaving){
                            clearTimeout(self.deactivateMonitorTimeout);
                        }
                    }
                })
            }

            // Setup for sensor pin
            this.pir = new Gpio(this.config.sensorPin, 'in', 'both');

            // Setup value which represent on and off
            const valueOn = this.config.sensorState;
            const valueOff = (this.config.sensorState + 1) % 2;

            // Detected movement
            this.pir.watch(function (err, value) {
                if (value == valueOn) {
                    self.sendSocketNotification('USER_PRESENCE', true);
                    if (self.config.powerSaving){
                        clearTimeout(self.deactivateMonitorTimeout);
                        self.activateMonitor();
                    }
                }
                else if (value == valueOff) {
                    self.sendSocketNotification('USER_PRESENCE', false);
                    if (!self.config.powerSaving){
                        return;
                    }

                    self.deactivateMonitorTimeout = setTimeout(function() {
                        self.deactivateMonitor();
                    }, self.config.powerSavingDelay * 1000);
                }
            });

            this.started = true;


        } else if (notification === "SCREEN_WAKEUP") {
            this.activateMonitor();
        } else if (notification === "ALEXA_MIRROR_ON") {
	    console.log("Turning mirror on due to Alexa command");
	    if(alexaControl) { 
		alexaControl = false;
		this.activateMonitor();
	    }
	} else if (notification === "ALEXA_MIRROR_OFF") {
	    console.log("Turning mirror off due to Alexa command");
	    if(!alexaControl) { 
		this.deactivateMonitor();
	        alexaControl = true;
	    }
	}
    }

});
