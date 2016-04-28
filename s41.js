var $q = require('q');
var com = require('serialport');
var debug = require('debug')('s4');

// MESSAGE FLOW
//
/*
Distance Message

Once every second during the workout a two byte message is sent containing the following information
Byte 0 Identification Number = FEh
Byte 1 Distance covered in last second in 0.1m units (as used by the distance display)
Note that this information will be sent at the next free sample slot and consequently transmission may be delayed by up to 125ms

Stroke Rate/Speed Message

At the start of every stroke (excluding the first stroke or a stroke >= 16 secs) during a workout a three byte message is sent containing the following information
Byte 0 Identification Number = FFh
Byte 1 Current no of Strokes per minute (equal to the displayed stroke rate)
Byte 2 Current Speed in 0.1m/s units (equal to the displayed speed)

End of Power Stroke Message

At the end of the power stroke (i.e. when the motor voltage ADC output falls back below the threshold level of 16), a one byte message is sent containing the following information.
Byte 0 Identification Number = FCh
If the power stoke contained an odd number of samples, then transmission will be delayed by one sample (i.e. 62.5ms).

Heart Rate Message
Whenever a Heart Rate value is received from the polar rate monitor, the following two byte message is sent.
Byte 0 Identification Number = FBh
Byte 1 Heart Rate Value (40-240)

*/

function S4() {
  var self = this;
  self.port = null;
  self.next = 'CMD';
  self.e = {
    'distance_dm': 0
  };

  this.readAndDispatch = function (data) {
    debug('[IN]: ' + data.toString('hex'));
    for (var c of data) {
      var current = self.next;
      switch (current) {
      case 'CMD':
	switch (c) {
	case 0xfe: // Distance
	  self.next = 'distance_dm';
          break;
	case 0xff: // SPM and Speed
	  self.next = 'strokes_per_min';
          break;
	case 0xfb: // HRM
	  self.next = 'BPM';
          break;
	case 0xfc: // stroke end
	  self.strokes++;
	  self.prev_stroke = self.last_stroke;
	  self.last_stroke = Date.now(); 
          break;
	default:
	  debug ('Unkown command ' + c.toString(16));
	}
	break;
      case 'strokes_per_min': //SPM
	self.e[current] = c;
	self.next = 'speed_dm_s';
	debug ('found ' + current + ' of ' + c + ', now waiting for ' + self.next);	
	break;
      case 'speed_dm_s':
	self.e[current] = c;
	self.next = 'CMD';
	debug ('found ' + current + ' of ' + c + ', now sending ' + JSON.stringify(self.e));	
	self.event.notify(self.e);
	break;
      case 'BPM':
	self.next = 'CMD';
	break;
      case 'distance_dm':
	self.e[current] += c;
	if (c === 0) {
	  self.e['strokes_per_min'] = 0;
	  self.e['speed_dm_s'] = 0;
	  self.event.notify(self.e);
	}
	  
	self.next = 'CMD';
	debug ('found ' + current + ' of ' + c + ', now waiting for ' + self.next);	
	break;
      default:
	self.event.error ('Unknown state "' + current + '"');
      }
    }
  }
}


S4.prototype.open = function (comName) {
    var self = this;
    var ready = $q.defer();
    var port = new com.SerialPort(comName, {
        baudrate: 1200,
    }, false);
    port.open(function () {
        self.port = port;
        port.on('data', self.readAndDispatch);
        ready.resolve();
    });
    return ready.promise;

};

S4.prototype.start = function () {
    this.event = $q.defer();
    return this.event.promise;
};

S4.prototype.exit = function () {
  if (this.event) {
    this.event.resolve("EXITED");
  }
};

S4.prototype.startRower = function(comName, callback) {
  var rower = this;

  console.log("[Init] Opening WaterRower S4 on com port: " + comName);
  rower.open(comName).then (
    function() {
      rower.start().then(
	function(data) {
	  console.log('[End] Workout ended successfully ...' + data);
        },
	function(data) {
	  console.log('[End] Workout failed ...' + data);
        },
	function(event) {
	  debug ('Got event '+ JSON.stringify(event));
	  callback (event);
	}
      );
    }
  );
};

S4.prototype.stopRower = function() {
  var self = this;
  return function() {
    self.exit();
  };
};

S4.prototype.fakeRower = function(callback) {
  console.log("[Init] Faking test data");
  var stroke_count = 0;
  var dist = 0;
  var test = function() {
/*
    var bpm = Math.floor(Math.random() * 10 + 120);
    callback({'heart_rate': bpm});
*/
    dist += 20;
    stroke_count = stroke_count + 1;
    callback ({
      'distance_dm': dist,
      'strokes_per_min': Math.floor(Math.random() * 5 + 22),
      'speed_dm_s': Math.floor(Math.random() * 5 + 36)
    });
    setTimeout(test, 666);
  };
  test();
};

module.exports = S4
