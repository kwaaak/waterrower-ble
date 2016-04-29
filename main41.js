var S4 = require('./s41');
var peripheral = require('ble-cycling-power');
var network = require('./network');

var main = function(args) {
  var device = args[2];
  var rower = new S4();
  var callback = function() {
    var ble = new peripheral.BluetoothPeripheral('WaterRower S4.1', ['./RSC-service']);

    return ble.notify;

  };

  if (args[3] === '--test') {
    rower.fakeRower(callback());
  } else {
    rower.startRower(device, callback());
  };

};

main(process.argv);
