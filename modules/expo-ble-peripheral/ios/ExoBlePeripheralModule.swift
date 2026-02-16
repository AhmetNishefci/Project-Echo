import ExpoModulesCore
import CoreBluetooth

let ECHO_SERVICE_UUID = CBUUID(string: "E5C00001-B5A3-F393-E0A9-E50E24DCCA9E")
let ECHO_TOKEN_CHAR_UUID = CBUUID(string: "E5C00002-B5A3-F393-E0A9-E50E24DCCA9E")
let RESTORE_ID = "echo-peripheral"

class BlePeripheralDelegate: NSObject, CBPeripheralManagerDelegate {
    var onPoweredOn: (() -> Void)?
    var currentToken: String = ""
    private var serviceAdded = false

    func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
        print("[ExoBlePeripheral] State: \(peripheral.state.rawValue)")
        if peripheral.state == .poweredOn {
            if !serviceAdded {
                addGattService(to: peripheral)
            }
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

    /// Respond to GATT read requests with the current ephemeral token.
    /// This is the key mechanism for background-to-background discovery:
    /// iOS strips the local name in background mode, so scanners connect
    /// and read this characteristic to get the token instead.
    func peripheralManager(
        _ peripheral: CBPeripheralManager,
        didReceiveRead request: CBATTRequest
    ) {
        if request.characteristic.uuid == ECHO_TOKEN_CHAR_UUID {
            let tokenData = currentToken.data(using: .utf8) ?? Data()
            if request.offset > tokenData.count {
                peripheral.respond(to: request, withResult: .invalidOffset)
                return
            }
            request.value = tokenData.subdata(in: request.offset..<tokenData.count)
            peripheral.respond(to: request, withResult: .success)
            print("[ExoBlePeripheral] GATT read: served token to scanner")
        } else {
            peripheral.respond(to: request, withResult: .attributeNotFound)
        }
    }

    /// Handle state restoration (iOS re-launches the app in background after termination)
    func peripheralManager(
        _ peripheral: CBPeripheralManager,
        willRestoreState dict: [String: Any]
    ) {
        print("[ExoBlePeripheral] State restored")
        if let services = dict[CBPeripheralManagerRestoredStateServicesKey] as? [CBMutableService],
           !services.isEmpty {
            serviceAdded = true
        }
    }

    func peripheralManager(
        _ peripheral: CBPeripheralManager,
        didAdd service: CBService,
        error: Error?
    ) {
        if let error = error {
            print("[ExoBlePeripheral] Failed to add GATT service: \(error.localizedDescription)")
        } else {
            serviceAdded = true
            print("[ExoBlePeripheral] GATT service added")
        }
    }

    private func addGattService(to manager: CBPeripheralManager) {
        let characteristic = CBMutableCharacteristic(
            type: ECHO_TOKEN_CHAR_UUID,
            properties: [.read],
            value: nil,  // nil = dynamic value, delegate handles reads
            permissions: [.readable]
        )

        let service = CBMutableService(type: ECHO_SERVICE_UUID, primary: true)
        service.characteristics = [characteristic]
        manager.add(service)
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
            self.delegate.currentToken = token

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
                // Use restore identifier so iOS can relaunch the app after termination
                self.peripheralManager = CBPeripheralManager(
                    delegate: self.delegate,
                    queue: nil,
                    options: [CBPeripheralManagerOptionRestoreIdentifierKey: RESTORE_ID]
                )
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
            self.delegate.currentToken = token
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
        self.delegate.currentToken = token
        manager.stopAdvertising()
        manager.startAdvertising([
            CBAdvertisementDataServiceUUIDsKey: [ECHO_SERVICE_UUID],
            CBAdvertisementDataLocalNameKey: "E:\(token)"
        ])
        promise.resolve(nil)
    }
}
