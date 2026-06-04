import Foundation
import LocalAuthentication

struct NativeRequest: Decodable {
    let command: String?
}

struct NativeResponse: Encodable {
    let ok: Bool
    let command: String
    let message: String
    let timestamp: String
}

enum NativeHostError: Error {
    case invalidLength
    case invalidJson
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

func handle(_ data: Data) throws -> NativeResponse {
    let request = try JSONDecoder().decode(NativeRequest.self, from: data)
    let command = request.command ?? "unknown"

    switch command {
    case "ping":
        return NativeResponse(ok: true, command: command, message: "pong", timestamp: nowIso8601())
    case "touchIdCheck":
        return evaluateTouchId()
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
