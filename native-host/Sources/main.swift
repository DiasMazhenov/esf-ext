import Foundation
import LocalAuthentication
import Security
import AppKit
import UniformTypeIdentifiers

struct NativeRequest: Decodable {
    let command: String?
    let iin: String?
    let tin: String?
    let certificatePath: String?
    let pin: String?
}

struct NativeResponse: Encodable {
    let ok: Bool
    let command: String
    let message: String
    let timestamp: String
    let configured: Bool?
    let iin: String?
    let tin: String?
    let certificatePath: String?

    init(
        ok: Bool,
        command: String,
        message: String,
        timestamp: String,
        configured: Bool? = nil,
        iin: String? = nil,
        tin: String? = nil,
        certificatePath: String? = nil
    ) {
        self.ok = ok
        self.command = command
        self.message = message
        self.timestamp = timestamp
        self.configured = configured
        self.iin = iin
        self.tin = tin
        self.certificatePath = certificatePath
    }
}

struct EsfConfig: Codable {
    let iin: String
    let tin: String
    let certificatePath: String
    let updatedAt: String
}

enum NativeHostError: Error {
    case invalidLength
    case invalidJson
    case invalidConfig(String)
    case keychain(OSStatus)
}

let keychainService = "kz.esf.touchid"
let pinAccount = "certificate-pin"

func appSupportDir(create: Bool) throws -> URL {
    let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    let dir = base.appendingPathComponent("kz.esf.touchid", isDirectory: true)
    if create {
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    }
    return dir
}

func configUrl(createDirectory: Bool) throws -> URL {
    try appSupportDir(create: createDirectory).appendingPathComponent("config.json")
}

func loadConfig() throws -> EsfConfig? {
    let url = try configUrl(createDirectory: false)
    guard FileManager.default.fileExists(atPath: url.path) else {
        return nil
    }
    let data = try Data(contentsOf: url)
    return try JSONDecoder().decode(EsfConfig.self, from: data)
}

func saveConfigFile(_ config: EsfConfig) throws {
    let data = try JSONEncoder().encode(config)
    try data.write(to: try configUrl(createDirectory: true), options: [.atomic])
}

func keychainQuery() -> [String: Any] {
    [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: keychainService,
        kSecAttrAccount as String: pinAccount
    ]
}

func savePin(_ pin: String) throws {
    let pinData = Data(pin.utf8)
    var query = keychainQuery()
    query[kSecValueData as String] = pinData
    query[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly

    let status = SecItemAdd(query as CFDictionary, nil)
    if status == errSecDuplicateItem {
        let update: [String: Any] = [kSecValueData as String: pinData]
        let updateStatus = SecItemUpdate(keychainQuery() as CFDictionary, update as CFDictionary)
        guard updateStatus == errSecSuccess else {
            throw NativeHostError.keychain(updateStatus)
        }
        return
    }

    guard status == errSecSuccess else {
        throw NativeHostError.keychain(status)
    }
}

func readPin() throws -> String? {
    var query = keychainQuery()
    query[kSecReturnData as String] = kCFBooleanTrue
    query[kSecMatchLimit as String] = kSecMatchLimitOne

    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    if status == errSecItemNotFound {
        return nil
    }
    guard status == errSecSuccess else {
        throw NativeHostError.keychain(status)
    }
    guard let data = item as? Data else {
        return nil
    }
    return String(data: data, encoding: .utf8)
}

func hasPin() -> Bool {
    (try? readPin()) != nil
}

func responseFromConfig(command: String, message: String, config: EsfConfig?, configured: Bool) -> NativeResponse {
    NativeResponse(
        ok: true,
        command: command,
        message: message,
        timestamp: nowIso8601(),
        configured: configured,
        iin: config?.iin,
        tin: config?.tin,
        certificatePath: config?.certificatePath
    )
}

func readMessage() throws -> Data? {
    let input = FileHandle.standardInput
    let lengthData = input.readData(ofLength: 4)

    if lengthData.isEmpty {
        return nil
    }

    guard lengthData.count == 4 else {
        throw NativeHostError.invalidLength
    }

    let length = lengthData.withUnsafeBytes { rawBuffer -> UInt32 in
        rawBuffer.load(as: UInt32.self).littleEndian
    }

    guard length > 0, length < 1024 * 1024 else {
        throw NativeHostError.invalidLength
    }

    let messageData = input.readData(ofLength: Int(length))
    guard messageData.count == Int(length) else {
        throw NativeHostError.invalidLength
    }

    return messageData
}

func writeMessage(_ response: NativeResponse) throws {
    let output = FileHandle.standardOutput
    let data = try JSONEncoder().encode(response)
    var length = UInt32(data.count).littleEndian
    let lengthData = Data(bytes: &length, count: 4)
    output.write(lengthData)
    output.write(data)
}

func nowIso8601() -> String {
    ISO8601DateFormatter().string(from: Date())
}

func normalizedRequired(_ value: String?, name: String) throws -> String {
    let trimmed = (value ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
        throw NativeHostError.invalidConfig("\(name) is required")
    }
    return trimmed
}

func evaluateTouchId() -> NativeResponse {
    let command = "touchIdCheck"
    let context = LAContext()
    context.localizedCancelTitle = "Отмена"

    var policyError: NSError?
    let policy = LAPolicy.deviceOwnerAuthenticationWithBiometrics

    guard context.canEvaluatePolicy(policy, error: &policyError) else {
        return NativeResponse(
            ok: false,
            command: command,
            message: policyError?.localizedDescription ?? "Touch ID is unavailable",
            timestamp: nowIso8601()
        )
    }

    let semaphore = DispatchSemaphore(value: 0)
    var response = NativeResponse(ok: false, command: command, message: "Touch ID was not completed", timestamp: nowIso8601())

    context.evaluatePolicy(policy, localizedReason: "Разрешить использование ЭЦП для входа в ИС ЭСФ") { success, error in
        response = NativeResponse(
            ok: success,
            command: command,
            message: success ? "touch-id-ok" : (error?.localizedDescription ?? "Touch ID failed"),
            timestamp: nowIso8601()
        )
        semaphore.signal()
    }

    semaphore.wait()
    return response
}

func saveEsfConfig(_ request: NativeRequest) throws -> NativeResponse {
    let command = "saveConfig"
    let iin = try normalizedRequired(request.iin, name: "iin")
    let tin = try normalizedRequired(request.tin, name: "tin")
    let certificatePath = try normalizedRequired(request.certificatePath, name: "certificatePath")
    let pin = try normalizedRequired(request.pin, name: "pin")

    guard FileManager.default.fileExists(atPath: certificatePath) else {
        throw NativeHostError.invalidConfig("certificate file not found")
    }

    try savePin(pin)
    let config = EsfConfig(iin: iin, tin: tin, certificatePath: certificatePath, updatedAt: nowIso8601())
    try saveConfigFile(config)

    return responseFromConfig(command: command, message: "config-saved", config: config, configured: true)
}

func configStatus() throws -> NativeResponse {
    let config = try loadConfig()
    let configured = config != nil && hasPin()
    return responseFromConfig(command: "configStatus", message: configured ? "configured" : "not-configured", config: config, configured: configured)
}

func unlockPinAfterTouchId() throws -> NativeResponse {
    let command = "unlockPin"
    guard let config = try loadConfig(), hasPin() else {
        return NativeResponse(ok: false, command: command, message: "setup-required", timestamp: nowIso8601(), configured: false)
    }

    let touchResponse = evaluateTouchId()
    guard touchResponse.ok else {
        return touchResponse
    }

    guard let pin = try readPin(), !pin.isEmpty else {
        return NativeResponse(ok: false, command: command, message: "pin-not-found", timestamp: nowIso8601(), configured: false)
    }

    return responseFromConfig(command: command, message: "pin-unlocked", config: config, configured: true)
}

func chooseCertificatePath() -> NativeResponse {
    let command = "chooseCertificate"
    let panel = NSOpenPanel()
    panel.title = "Выберите файл ЭЦП"
    panel.message = "Выберите .p12 файл для ИС ЭСФ"
    panel.canChooseDirectories = false
    panel.canChooseFiles = true
    panel.allowsMultipleSelection = false
    panel.allowedContentTypes = ["p12", "pfx"].compactMap { UTType(filenameExtension: $0) }

    guard panel.runModal() == .OK, let url = panel.url else {
        return NativeResponse(ok: false, command: command, message: "file-selection-cancelled", timestamp: nowIso8601())
    }

    return NativeResponse(
        ok: true,
        command: command,
        message: "certificate-selected",
        timestamp: nowIso8601(),
        certificatePath: url.path
    )
}

func handle(_ data: Data) throws -> NativeResponse {
    let request = try JSONDecoder().decode(NativeRequest.self, from: data)
    let command = request.command ?? "unknown"

    switch command {
    case "ping":
        return NativeResponse(ok: true, command: command, message: "pong", timestamp: nowIso8601())
    case "touchIdCheck":
        return evaluateTouchId()
    case "saveConfig":
        return try saveEsfConfig(request)
    case "configStatus":
        return try configStatus()
    case "unlockPin":
        return try unlockPinAfterTouchId()
    case "chooseCertificate":
        return chooseCertificatePath()
    default:
        return NativeResponse(ok: false, command: command, message: "unsupported command", timestamp: nowIso8601())
    }
}

do {
    while let message = try readMessage() {
        let response = try handle(message)
        try writeMessage(response)
    }
} catch {
    let response = NativeResponse(ok: false, command: "error", message: String(describing: error), timestamp: nowIso8601())
    try? writeMessage(response)
}
