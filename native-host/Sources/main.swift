import Foundation
import LocalAuthentication
import Security

struct NativeRequest: Decodable {
    let command: String?
    let iin: String?
    let tin: String?
    let certificatePath: String?
    let pin: String?
    let soapPassword: String?
    let xml: String?
    let signedAuthTicket: String?
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
    let signedXml: String?
    let authTicketXml: String?
    let sessionId: String?
    let diagnostics: String?
    let webPassword: String?

    init(
        ok: Bool,
        command: String,
        message: String,
        timestamp: String,
        configured: Bool? = nil,
        iin: String? = nil,
        tin: String? = nil,
        certificatePath: String? = nil,
        signedXml: String? = nil,
        authTicketXml: String? = nil,
        sessionId: String? = nil,
        diagnostics: String? = nil,
        webPassword: String? = nil
    ) {
        self.ok = ok
        self.command = command
        self.message = message
        self.timestamp = timestamp
        self.configured = configured
        self.iin = iin
        self.tin = tin
        self.certificatePath = certificatePath
        self.signedXml = signedXml
        self.authTicketXml = authTicketXml
        self.sessionId = sessionId
        self.diagnostics = diagnostics
        self.webPassword = webPassword
    }
}

struct SignXmlResult {
    let signedXml: String
    let diagnostics: String
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
let soapPasswordAccount = "soap-password"
let signXmlPath = "/Users/diasmazhenov/vibecode/esf-ext/sdk-bridge/bin/sign-xml"
let esfWebUrl = "https://esf.gov.kz:8443/esf-web"

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

func debugDir(create: Bool) throws -> URL {
    let dir = try appSupportDir(create: create).appendingPathComponent("debug", isDirectory: true)
    if create {
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    }
    return dir
}

func debugTimestamp() -> String {
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyyMMdd-HHmmss"
    formatter.timeZone = TimeZone(identifier: "Asia/Almaty")
    return formatter.string(from: Date())
}

func writeDebugXml(_ name: String, _ xml: String) {
    do {
        let url = try debugDir(create: true).appendingPathComponent("\(debugTimestamp())-\(name).xml")
        try xml.write(to: url, atomically: true, encoding: .utf8)
    } catch {
        // Debug output must never break auth flow.
    }
}

func writeDebugText(_ name: String, _ text: String, ext: String = "txt") {
    do {
        let safeExt = ext.trimmingCharacters(in: CharacterSet(charactersIn: "."))
        let url = try debugDir(create: true).appendingPathComponent("\(debugTimestamp())-\(name).\(safeExt)")
        try text.write(to: url, atomically: true, encoding: .utf8)
    } catch {
        // Debug output must never break auth flow.
    }
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

func keychainQuery(account: String = pinAccount) -> [String: Any] {
    [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: keychainService,
        kSecAttrAccount as String: account
    ]
}

func saveSecret(_ value: String, account: String) throws {
    let secretData = Data(value.utf8)
    var query = keychainQuery(account: account)
    query[kSecValueData as String] = secretData
    query[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly

    let status = SecItemAdd(query as CFDictionary, nil)
    if status == errSecDuplicateItem {
        let update: [String: Any] = [kSecValueData as String: secretData]
        let updateStatus = SecItemUpdate(keychainQuery(account: account) as CFDictionary, update as CFDictionary)
        guard updateStatus == errSecSuccess else {
            throw NativeHostError.keychain(updateStatus)
        }
        return
    }

    guard status == errSecSuccess else {
        throw NativeHostError.keychain(status)
    }
}

func readSecret(account: String) throws -> String? {
    var query = keychainQuery(account: account)
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

func savePin(_ pin: String) throws {
    try saveSecret(pin, account: pinAccount)
}

func readPin() throws -> String? {
    try readSecret(account: pinAccount)
}

func hasPin() -> Bool {
    (try? readPin()) != nil
}

func saveSoapPassword(_ password: String) throws {
    try saveSecret(password, account: soapPasswordAccount)
}

func readSoapPassword() throws -> String? {
    try readSecret(account: soapPasswordAccount)
}

func hasSoapPassword() -> Bool {
    (try? readSoapPassword()) != nil
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

func xmlEscape(_ value: String) -> String {
    value
        .replacingOccurrences(of: "&", with: "&amp;")
        .replacingOccurrences(of: "<", with: "&lt;")
        .replacingOccurrences(of: ">", with: "&gt;")
        .replacingOccurrences(of: "\"", with: "&quot;")
        .replacingOccurrences(of: "'", with: "&apos;")
}

func xmlUnescape(_ value: String) -> String {
    value
        .replacingOccurrences(of: "&lt;", with: "<")
        .replacingOccurrences(of: "&gt;", with: ">")
        .replacingOccurrences(of: "&quot;", with: "\"")
        .replacingOccurrences(of: "&apos;", with: "'")
        .replacingOccurrences(of: "&amp;", with: "&")
}

func xmlCdata(_ value: String) -> String {
    "<![CDATA[\(value.replacingOccurrences(of: "]]>", with: "]]]]><![CDATA[>"))]]>"
}

func extractXmlElement(_ name: String, from xml: String) -> String? {
    let pattern = "<(?:[A-Za-z0-9_]+:)?\(name)\\b[^>]*>([\\s\\S]*?)</(?:[A-Za-z0-9_]+:)?\(name)>"
    guard let regex = try? NSRegularExpression(pattern: pattern) else {
        return nil
    }
    let range = NSRange(xml.startIndex..<xml.endIndex, in: xml)
    guard let match = regex.firstMatch(in: xml, range: range),
          let valueRange = Range(match.range(at: 1), in: xml) else {
        return nil
    }
    return xmlUnescape(String(xml[valueRange]).trimmingCharacters(in: .whitespacesAndNewlines))
}

func extractAttribute(_ elementName: String, _ attributeName: String, from xml: String) -> String? {
    let pattern = "<(?:[A-Za-z0-9_]+:)?\(elementName)\\b[^>]*\\s\(attributeName)=\"([^\"]+)\""
    guard let regex = try? NSRegularExpression(pattern: pattern) else {
        return nil
    }
    let range = NSRange(xml.startIndex..<xml.endIndex, in: xml)
    guard let match = regex.firstMatch(in: xml, range: range),
          let valueRange = Range(match.range(at: 1), in: xml) else {
        return nil
    }
    return String(xml[valueRange])
}

func extractAttributes(_ elementName: String, _ attributeName: String, from xml: String) -> [String] {
    let pattern = "<(?:[A-Za-z0-9_]+:)?\(elementName)\\b[^>]*\\s\(attributeName)=\"([^\"]+)\""
    guard let regex = try? NSRegularExpression(pattern: pattern) else {
        return []
    }
    let range = NSRange(xml.startIndex..<xml.endIndex, in: xml)
    return regex.matches(in: xml, range: range).compactMap { match in
        guard let valueRange = Range(match.range(at: 1), in: xml) else {
            return nil
        }
        return String(xml[valueRange])
    }
}

func extractElements(_ name: String, from xml: String) -> [String] {
    let pattern = "<(?:[A-Za-z0-9_]+:)?\(name)\\b[^>]*>([\\s\\S]*?)</(?:[A-Za-z0-9_]+:)?\(name)>"
    guard let regex = try? NSRegularExpression(pattern: pattern) else {
        return []
    }
    let range = NSRange(xml.startIndex..<xml.endIndex, in: xml)
    return regex.matches(in: xml, range: range).compactMap { match in
        guard let valueRange = Range(match.range(at: 1), in: xml) else {
            return nil
        }
        return xmlUnescape(String(xml[valueRange]).trimmingCharacters(in: .whitespacesAndNewlines))
    }
}

func compactDiagnostics(_ value: String) -> String {
    value
        .split(whereSeparator: \.isNewline)
        .map(String.init)
        .filter { !$0.hasPrefix("SLF4J:") }
        .joined(separator: "; ")
}

func postSoap(url: URL, soapAction: String, envelope: String, debugName: String? = nil) throws -> String {
    if let debugName {
        writeDebugXml("\(debugName)-request", envelope)
    }

    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.timeoutInterval = 30
    request.setValue("text/xml; charset=utf-8", forHTTPHeaderField: "Content-Type")
    request.setValue(soapAction, forHTTPHeaderField: "SOAPAction")
    request.httpBody = Data(envelope.utf8)

    let semaphore = DispatchSemaphore(value: 0)
    var result: Result<String, Error>?

    URLSession.shared.dataTask(with: request) { data, response, error in
        defer { semaphore.signal() }
        if let error {
            result = .failure(error)
            return
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            result = .failure(NativeHostError.invalidConfig("missing HTTP response"))
            return
        }

        let body = String(data: data ?? Data(), encoding: .utf8) ?? ""
        if let debugName {
            writeDebugXml("\(debugName)-response", body)
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            result = .failure(NativeHostError.invalidConfig("SOAP HTTP \(httpResponse.statusCode): \(body.prefix(500))"))
            return
        }

        result = .success(body)
    }.resume()

    semaphore.wait()
    return try result!.get()
}

func signedTicketTrace(config: EsfConfig, signedAuthTicket: String, source: String, soapAction: String, wsSecurityHeader: String) -> String {
    let ticketIin = extractXmlElement("iin", from: signedAuthTicket) ?? "missing"
    let timeMark = extractXmlElement("timeMark", from: signedAuthTicket) ?? "missing"
    let state = extractXmlElement("state", from: signedAuthTicket) ?? ""
    let signatureMethod = extractAttribute("SignatureMethod", "Algorithm", from: signedAuthTicket) ?? "missing"
    let digestMethod = extractAttribute("DigestMethod", "Algorithm", from: signedAuthTicket) ?? "missing"
    let canonicalizationMethod = extractAttribute("CanonicalizationMethod", "Algorithm", from: signedAuthTicket) ?? "missing"
    let transforms = extractAttributes("Transform", "Algorithm", from: signedAuthTicket)
    let signatureValue = extractXmlElement("SignatureValue", from: signedAuthTicket) ?? ""
    let certificateValue = extractXmlElement("X509Certificate", from: signedAuthTicket) ?? ""
    let referenceUri = extractAttribute("Reference", "URI", from: signedAuthTicket) ?? "missing"
    let keyInfoCount = extractElements("KeyInfo", from: signedAuthTicket).count

    let fields: [(String, String)] = [
        ("source", source),
        ("endpoint", "\(esfWebUrl)/ws/api1/SessionService"),
        ("soapAction", soapAction.isEmpty ? "empty" : soapAction),
        ("wsSecurityHeader", wsSecurityHeader),
        ("configIinLength", "\(config.iin.count)"),
        ("configTinLength", "\(config.tin.count)"),
        ("ticketIinMatchesConfig", "\(ticketIin == config.iin)"),
        ("ticketIinPresent", "\(ticketIin != "missing")"),
        ("timeMark", timeMark),
        ("stateLength", "\(state.count)"),
        ("signedTicketLength", "\(signedAuthTicket.count)"),
        ("signatureMethod", signatureMethod),
        ("digestMethod", digestMethod),
        ("canonicalizationMethod", canonicalizationMethod),
        ("referenceUri", referenceUri),
        ("transformCount", "\(transforms.count)"),
        ("transforms", transforms.joined(separator: " | ")),
        ("signatureValueLength", "\(signatureValue.count)"),
        ("x509CertificateLength", "\(certificateValue.count)"),
        ("keyInfoCount", "\(keyInfoCount)")
    ]

    let body = fields
        .map { "\"\($0.0)\": \"\(xmlEscape($0.1))\"" }
        .joined(separator: ",\n  ")
    return "{\n  \(body)\n}"
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
            message: policyError?.localizedDescription ?? "Biometrics are unavailable",
            timestamp: nowIso8601()
        )
    }

    let semaphore = DispatchSemaphore(value: 0)
    var response = NativeResponse(ok: false, command: command, message: "Biometric authentication was not completed", timestamp: nowIso8601())

    context.evaluatePolicy(policy, localizedReason: "Разрешить использование ЭЦП для входа в ИС ЭСФ") { success, error in
        response = NativeResponse(
            ok: success,
            command: command,
            message: success ? "biometry-ok" : (error?.localizedDescription ?? "Biometric authentication failed"),
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
    let tin = request.tin?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
        ? try normalizedRequired(request.tin, name: "tin")
        : iin
    let certificatePath = try normalizedRequired(request.certificatePath, name: "certificatePath")
    let pin = try normalizedRequired(request.pin, name: "pin")
    let soapPassword = request.soapPassword?.trimmingCharacters(in: .whitespacesAndNewlines)

    guard FileManager.default.fileExists(atPath: certificatePath) else {
        throw NativeHostError.invalidConfig("certificate file not found")
    }

    try savePin(pin)
    if let soapPassword, !soapPassword.isEmpty {
        try saveSoapPassword(soapPassword)
    }
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

func createAuthTicketXml(config: EsfConfig) throws -> String {
    let endpoint = URL(string: "\(esfWebUrl)/ws/api1/AuthService")!
    let envelope = """
    <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:esf="esf">
      <soapenv:Header/>
      <soapenv:Body>
        <esf:createAuthTicketRequest>
          <iin>\(xmlEscape(config.iin))</iin>
          <ttlInMinutes>15</ttlInMinutes>
        </esf:createAuthTicketRequest>
      </soapenv:Body>
    </soapenv:Envelope>
    """

    let responseXml = try postSoap(url: endpoint, soapAction: "esf/AuthService/createAuthTicket", envelope: envelope)
    guard let authTicketXml = extractXmlElement("authTicketXml", from: responseXml), !authTicketXml.isEmpty else {
        throw NativeHostError.invalidConfig("authTicketXml not found in SOAP response")
    }
    return authTicketXml
}

func createAuthTicket() throws -> NativeResponse {
    let command = "createAuthTicket"
    guard let config = try loadConfig() else {
        return NativeResponse(ok: false, command: command, message: "setup-required", timestamp: nowIso8601(), configured: false)
    }

    let authTicketXml = try createAuthTicketXml(config: config)
    writeDebugXml("auth-ticket", authTicketXml)

    return NativeResponse(
        ok: true,
        command: command,
        message: "auth-ticket-created",
        timestamp: nowIso8601(),
        configured: true,
        iin: config.iin,
        tin: config.tin,
        certificatePath: config.certificatePath,
        authTicketXml: authTicketXml
    )
}

func createSessionSigned(config: EsfConfig, signedAuthTicket: String, diagnostics: String) throws -> String {
    writeDebugXml("signed-auth-ticket", signedAuthTicket)
    let endpoint = URL(string: "\(esfWebUrl)/ws/api1/SessionService")!
    let soapAction = ""
    let soapPassword = try readSoapPassword()
    let wsSecurityHeader = soapPassword?.isEmpty == false ? "usernameToken" : "empty"
    let soapHeader: String
    if let soapPassword, !soapPassword.isEmpty {
        soapHeader = """
          <soapenv:Header>
            <wsse:Security soapenv:mustUnderstand="1" xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd" xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">
              <wsse:UsernameToken wsu:Id="UsernameToken-\(debugTimestamp())">
                <wsse:Username>\(xmlEscape(config.iin))</wsse:Username>
                <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">\(xmlEscape(soapPassword))</wsse:Password>
              </wsse:UsernameToken>
            </wsse:Security>
          </soapenv:Header>
        """
    } else {
        soapHeader = "  <soapenv:Header/>"
    }
    let envelope = """
    <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:esf="esf">
    \(soapHeader)
      <soapenv:Body>
        <esf:createSessionSignedRequest>
          <tin>\(xmlEscape(config.tin))</tin>
          <signedAuthTicket>\(xmlCdata(signedAuthTicket))</signedAuthTicket>
        </esf:createSessionSignedRequest>
      </soapenv:Body>
    </soapenv:Envelope>
    """

    let signatureMethod = extractAttribute("SignatureMethod", "Algorithm", from: signedAuthTicket) ?? "unknown"
    let trace = signedTicketTrace(
        config: config,
        signedAuthTicket: signedAuthTicket,
        source: diagnostics,
        soapAction: soapAction,
        wsSecurityHeader: wsSecurityHeader
    )
    writeDebugText("create-session-signed-trace", trace, ext: "json")

    do {
        let responseXml = try postSoap(url: endpoint, soapAction: soapAction, envelope: envelope, debugName: "create-session-signed")
        guard let sessionId = extractXmlElement("sessionId", from: responseXml), !sessionId.isEmpty else {
            throw NativeHostError.invalidConfig("sessionId not found in SOAP response")
        }
        return sessionId
    } catch NativeHostError.invalidConfig(let message) {
        let debugPath = (try? debugDir(create: true).path) ?? "unavailable"
        throw NativeHostError.invalidConfig("\(message); createSessionSigned soapAction=empty; wsSecurityHeader=\(wsSecurityHeader); tinLength=\(config.tin.count); signatureMethod=\(signatureMethod); debugTrace=create-session-signed-trace; debugDir=\(debugPath); \(diagnostics)")
    }
}

func runSignXml(xml: String, certificatePath: String, pin: String) throws -> SignXmlResult {
    guard FileManager.default.isExecutableFile(atPath: signXmlPath) else {
        throw NativeHostError.invalidConfig("sign-xml bridge is not built")
    }

    let process = Process()
    process.executableURL = URL(fileURLWithPath: signXmlPath)
    process.arguments = [certificatePath]
    process.environment = ProcessInfo.processInfo.environment.merging(["ESF_CERT_PIN": pin]) { _, new in new }

    let input = Pipe()
    let output = Pipe()
    let errorOutput = Pipe()
    process.standardInput = input
    process.standardOutput = output
    process.standardError = errorOutput

    try process.run()
    input.fileHandleForWriting.write(Data(xml.utf8))
    input.fileHandleForWriting.closeFile()
    process.waitUntilExit()

    let signedData = output.fileHandleForReading.readDataToEndOfFile()
    let errorData = errorOutput.fileHandleForReading.readDataToEndOfFile()
    let signedXml = String(data: signedData, encoding: .utf8)?
        .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let diagnostics = compactDiagnostics(String(data: errorData, encoding: .utf8)?
        .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    )

    guard process.terminationStatus == 0, !signedXml.isEmpty else {
        throw NativeHostError.invalidConfig(diagnostics.isEmpty ? "sign-xml failed" : diagnostics)
    }

    return SignXmlResult(signedXml: signedXml, diagnostics: diagnostics)
}

func signXmlAfterTouchId(_ request: NativeRequest) throws -> NativeResponse {
    let command = "signXml"
    let xml = try normalizedRequired(request.xml, name: "xml")

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

    let signResult = try runSignXml(xml: xml, certificatePath: config.certificatePath, pin: pin)
    return NativeResponse(
        ok: true,
        command: command,
        message: "xml-signed",
        timestamp: nowIso8601(),
        configured: true,
        iin: config.iin,
        tin: config.tin,
        certificatePath: config.certificatePath,
        signedXml: signResult.signedXml,
        diagnostics: signResult.diagnostics
    )
}

func signWebTicketAfterTouchId(_ request: NativeRequest) throws -> NativeResponse {
    let command = "signWebTicket"
    let xml = try normalizedRequired(request.xml, name: "xml")

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

    guard let webPassword = try readSoapPassword(), !webPassword.isEmpty else {
        return NativeResponse(ok: false, command: command, message: "web-password-not-found", timestamp: nowIso8601(), configured: true)
    }

    let signResult = try runSignXml(xml: xml, certificatePath: config.certificatePath, pin: pin)
    return NativeResponse(
        ok: true,
        command: command,
        message: "web-ticket-signed",
        timestamp: nowIso8601(),
        configured: true,
        iin: config.iin,
        tin: config.tin,
        certificatePath: config.certificatePath,
        signedXml: signResult.signedXml,
        diagnostics: signResult.diagnostics,
        webPassword: webPassword
    )
}

func createSignedSessionAfterTouchId() throws -> NativeResponse {
    let command = "createSignedSession"
    guard let config = try loadConfig(), hasPin() else {
        return NativeResponse(ok: false, command: command, message: "setup-required", timestamp: nowIso8601(), configured: false)
    }

    let authTicketXml = try createAuthTicketXml(config: config)

    let touchResponse = evaluateTouchId()
    guard touchResponse.ok else {
        return touchResponse
    }

    guard let pin = try readPin(), !pin.isEmpty else {
        return NativeResponse(ok: false, command: command, message: "pin-not-found", timestamp: nowIso8601(), configured: false)
    }

    let signResult = try runSignXml(xml: authTicketXml, certificatePath: config.certificatePath, pin: pin)
    let sessionId = try createSessionSigned(
        config: config,
        signedAuthTicket: signResult.signedXml,
        diagnostics: signResult.diagnostics
    )

    return NativeResponse(
        ok: true,
        command: command,
        message: "session-created",
        timestamp: nowIso8601(),
        configured: true,
        iin: config.iin,
        tin: config.tin,
        certificatePath: config.certificatePath,
        sessionId: sessionId
    )
}

func createSessionFromSignedTicket(_ request: NativeRequest) throws -> NativeResponse {
    let command = "createSessionFromSignedTicket"
    guard let config = try loadConfig() else {
        return NativeResponse(ok: false, command: command, message: "setup-required", timestamp: nowIso8601(), configured: false)
    }

    let signedAuthTicket = try normalizedRequired(request.signedAuthTicket ?? request.xml, name: "signedAuthTicket")
    let sessionId = try createSessionSigned(config: config, signedAuthTicket: signedAuthTicket, diagnostics: "signedBy=ncalayer")

    return NativeResponse(
        ok: true,
        command: command,
        message: "session-created",
        timestamp: nowIso8601(),
        configured: true,
        iin: config.iin,
        tin: config.tin,
        certificatePath: config.certificatePath,
        sessionId: sessionId,
        diagnostics: "signedBy=ncalayer"
    )
}

func chooseCertificatePath() -> NativeResponse {
    let command = "chooseCertificate"

    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
    process.arguments = [
        "-e",
        """
        set chosenFile to choose file with prompt "Выберите файл ЭЦП (.p12/.pfx)" of type {"p12", "pfx"}
        POSIX path of chosenFile
        """
    ]

    let output = Pipe()
    let errorOutput = Pipe()
    process.standardOutput = output
    process.standardError = errorOutput

    do {
        try process.run()
        process.waitUntilExit()
    } catch {
        return NativeResponse(ok: false, command: command, message: "file-picker-failed: \(error.localizedDescription)", timestamp: nowIso8601())
    }

    if process.terminationStatus != 0 {
        let errorData = errorOutput.fileHandleForReading.readDataToEndOfFile()
        let errorMessage = String(data: errorData, encoding: .utf8)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return NativeResponse(ok: false, command: command, message: errorMessage ?? "file-selection-cancelled", timestamp: nowIso8601())
    }

    let data = output.fileHandleForReading.readDataToEndOfFile()
    let path = String(data: data, encoding: .utf8)?
        .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

    guard !path.isEmpty else {
        return NativeResponse(ok: false, command: command, message: "file-selection-empty", timestamp: nowIso8601())
    }

    return NativeResponse(
        ok: true,
        command: command,
        message: "certificate-selected",
        timestamp: nowIso8601(),
        certificatePath: path
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
    case "createAuthTicket":
        return try createAuthTicket()
    case "createSignedSession":
        return try createSignedSessionAfterTouchId()
    case "createSessionFromSignedTicket":
        return try createSessionFromSignedTicket(request)
    case "signXml":
        return try signXmlAfterTouchId(request)
    case "signWebTicket":
        return try signWebTicketAfterTouchId(request)
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
