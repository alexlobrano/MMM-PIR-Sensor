/* global Module */

/* Magic Mirror
* Module: MMM-PIR-Sensor
*
* By Paul-Vincent Roll http://paulvincentroll.com
* MIT Licensed.
*/

Module.register('MMM-PIR-Sensor',{
	requiresVersion: '2.1.0',
	defaults: {
		sensorPin: 22,
		sensorState: 1,
		relayPin: false,
		relayState: 1,
		alwaysOnPin: false,
		alwaysOnState: 1,
		alwaysOffPin: false,
		alwaysOffState: 1,
		powerSaving: true,
		powerSavingDelay: 0,
		powerSavingNotification: false,
		powerSavingMessage: "Monitor will be turn Off by PIR module", 
	},

	// Override socket notification handler.
	socketNotificationReceived: function (notification, payload) {
		if (notification === 'USER_PRESENCE') {
			this.sendNotification(notification, payload)
			if (payload === false && this.config.powerSavingNotification === true){
				this.sendNotification("SHOW_ALERT",{type:"notification", message:this.config.powerSavingMessage});
			}
		} else if (notification === 'SHOW_ALERT') {
			this.sendNotification(notification, payload)
		}
	},

	notificationReceived: function (notification, payload) {
		Log.info(this.name + " received a system notification: " + notification);
		if (notification === "SCREEN_WAKEUP") {
			this.sendNotification(notification, payload)
		}
		else if (notification === "ALEXA_MIRROR_ON") {
			Log.info(this.name + " is sending " + notification + " to socket");
			this.sendSocketNotification(notification, payload);
		}
		else if (notification === "ALEXA_MIRROR_OFF") {
			Log.info(this.name + " is sending " + notification + " to socket");
			this.sendSocketNotification(notification, payload);
		}
	},

	start: function () {
		this.sendSocketNotification('CONFIG', this.config);
		Log.info('Starting module: ' + this.name);
	}
});
