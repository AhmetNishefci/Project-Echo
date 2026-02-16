import ExpoModulesCore
import CoreBluetooth

let ECHO_SERVICE_UUID = CBUUID(string: "E5C00001-B5A3-F393-E0A9-E50E24DCCA9E")

class BlePeripheralDelegate: NSObject, CBPeripheralManagerDelegate {
    var onPoweredOn: (() -> Void)?

    func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
        if peripheral.state == .poweredOn {
            onPoweredOn?()
        }
    }

    func peripheralManagerDidStartAdvertising(
        _ peripheral: CBPeripheralManager,
        error: Error?
    ) {
        if let error = error {
            print("[ExoBlePeripheral] Advertising failed: \(error.localizedDescription)")
        } else {
            print("[ExoBlePeripheral] Advertising started")
        }
    }
}

public class ExoBlePeripheralModule: Module {
    private var peripheralManager: CBPeripheralManager?
    private var delegate = BlePeripheralDelegate()
    private var currentToken: String = ""
    private var pendingStartPromise: Promise?
    private var pendingToken: String?

    public func definition() -> ModuleDefinition {
        Name("ExoBlePeripheral")

        AsyncFunction("startAdvertising") { (token: String, promise: Promise) in
            self.currentToken = token

            if self.peripheralManager == nil {
                self.pendingStartPromise = promise
                self.pendingToken = token
                self.delegate.onPoweredOn = { [weak self] in
                    guard let self = self else { return }
                    if let p = self.pendingStartPromise, let t = self.pendingToken {
                        self.pendingStartPromise = nil
                        self.pendingToken = nil
                        self.startAd(token: t, promise: p)
                    }
                }
                self.peripheralManager = CBPeripheralManager(delegate: self.delegate, queue: nil)
                return
            }

            guard self.peripheralManager?.state == .poweredOn else {
                self.pendingStartPromise = promise
                self.pendingToken = token
                return
            }

            self.startAd(token: token, promise: promise)
        }

        AsyncFunction("stopAdvertising") { (promise: Promise) in
            self.peripheralManager?.stopAdvertising()
            promise.resolve(nil)
        }

        AsyncFunction("updateToken") { (token: String, promise: Promise) in
            self.currentToken = token
            guard let manager = self.peripheralManager, manager.state == .poweredOn else {
                promise.resolve(nil)
                return
            }
            manager.stopAdvertising()
            manager.startAdvertising([
                CBAdvertisementDataServiceUUIDsKey: [ECHO_SERVICE_UUID],
                CBAdvertisementDataLocalNameKey: "E:\(token)"
            ])
            promise.resolve(nil)
        }

        AsyncFunction("isSupported") { (promise: Promise) in
            promise.resolve(true)
        }
    }

    private func startAd(token: String, promise: Promise) {
        guard let manager = self.peripheralManager else {
            promise.reject("BLE_ERROR", "Peripheral manager is nil")
            return
        }

        self.currentToken = token
        manager.stopAdvertising()
        manager.startAdvertising([
            CBAdvertisementDataServiceUUIDsKey: [ECHO_SERVICE_UUID],
            CBAdvertisementDataLocalNameKey: "E:\(token)"
        ])
        promise.resolve(nil)
    }
}
