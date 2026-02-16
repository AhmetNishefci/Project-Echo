package expo.modules.bleperipheral

import android.bluetooth.*
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.BluetoothLeAdvertiser
import android.content.Context
import android.os.ParcelUuid
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import java.util.UUID

class ExoBlePeripheralModule : Module() {

    companion object {
        private const val TAG = "ExoBlePeripheral"
        val ECHO_SERVICE_UUID: UUID = UUID.fromString("E5C00001-B5A3-F393-E0A9-E50E24DCCA9E")
    }

    private var bluetoothManager: BluetoothManager? = null
    private var advertiser: BluetoothLeAdvertiser? = null
    private var currentToken: String = ""
    private var isAdvertising = false

    private val advertiseCallback = object : AdvertiseCallback() {
        override fun onStartSuccess(settingsInEffect: AdvertiseSettings) {
            Log.d(TAG, "Advertising started: E:$currentToken")
            isAdvertising = true
        }

        override fun onStartFailure(errorCode: Int) {
            Log.e(TAG, "Advertising failed with error code: $errorCode")
            isAdvertising = false
        }
    }

    override fun definition() = ModuleDefinition {
        Name("ExoBlePeripheral")

        AsyncFunction("startAdvertising") { token: String, promise: Promise ->
            try {
                currentToken = token
                val context = appContext.reactContext ?: run {
                    promise.reject("BLE_ERROR", "Context is null", null)
                    return@AsyncFunction
                }

                bluetoothManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
                val adapter = bluetoothManager?.adapter

                if (adapter == null || !adapter.isEnabled) {
                    promise.reject("BLE_ERROR", "Bluetooth is not enabled", null)
                    return@AsyncFunction
                }

                // Encode token in the device name for local name advertising
                adapter.name = "E:$token"

                advertiser = adapter.bluetoothLeAdvertiser
                if (advertiser == null) {
                    promise.reject("BLE_ERROR", "BLE Advertising not supported on this device", null)
                    return@AsyncFunction
                }

                val settings = AdvertiseSettings.Builder()
                    .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
                    .setConnectable(false)
                    .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_MEDIUM)
                    .build()

                val data = AdvertiseData.Builder()
                    .setIncludeDeviceName(true)
                    .addServiceUuid(ParcelUuid(ECHO_SERVICE_UUID))
                    .build()

                advertiser?.startAdvertising(settings, data, advertiseCallback)
                promise.resolve(null)
            } catch (e: Exception) {
                Log.e(TAG, "startAdvertising failed", e)
                promise.reject("BLE_ERROR", e.message, e)
            }
        }

        AsyncFunction("stopAdvertising") { promise: Promise ->
            try {
                advertiser?.stopAdvertising(advertiseCallback)
                isAdvertising = false
                promise.resolve(null)
            } catch (e: Exception) {
                promise.reject("BLE_ERROR", e.message, e)
            }
        }

        AsyncFunction("updateToken") { token: String, promise: Promise ->
            try {
                currentToken = token
                val adapter = bluetoothManager?.adapter
                adapter?.name = "E:$token"

                if (isAdvertising) {
                    advertiser?.stopAdvertising(advertiseCallback)

                    val settings = AdvertiseSettings.Builder()
                        .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
                        .setConnectable(false)
                        .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_MEDIUM)
                        .build()

                    val data = AdvertiseData.Builder()
                        .setIncludeDeviceName(true)
                        .addServiceUuid(ParcelUuid(ECHO_SERVICE_UUID))
                        .build()

                    advertiser?.startAdvertising(settings, data, advertiseCallback)
                }
                promise.resolve(null)
            } catch (e: Exception) {
                promise.reject("BLE_ERROR", e.message, e)
            }
        }

        AsyncFunction("isSupported") { promise: Promise ->
            val context = appContext.reactContext
            val manager = context?.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
            val adapter = manager?.adapter
            val supported = adapter?.bluetoothLeAdvertiser != null
            promise.resolve(supported)
        }
    }
}
