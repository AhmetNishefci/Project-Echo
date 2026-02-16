require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'ExoBlePeripheral'
  s.version        = package['version']
  s.summary        = 'Expo module for BLE peripheral advertising'
  s.description    = 'Expo module for BLE peripheral advertising'
  s.license        = 'MIT'
  s.author         = 'Echo'
  s.homepage       = 'https://github.com/example'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: 'https://github.com/example.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
  s.frameworks = 'CoreBluetooth'
end
