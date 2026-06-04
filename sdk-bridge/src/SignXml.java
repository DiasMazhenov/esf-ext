import kz.gov.pki.kalkan.jce.provider.KalkanProvider;
import kz.gov.pki.kalkan.xmldsig.KncaXS;
import kz.gov.pki.provider.utils.XMLUtil;
import kz.gov.pki.provider.utils.model.SigningEntity;
import ru.ussgroup.security.trusty.TrustyUtils;

import javax.security.auth.x500.X500Principal;
import javax.security.auth.x500.X500PrivateCredential;
import java.nio.charset.StandardCharsets;
import java.security.Security;
import java.security.cert.X509Certificate;
import java.util.Collections;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class SignXml {
    private static final Pattern IIN_PATTERN = Pattern.compile("<iin>(\\d{12})</iin>");
    private static final Pattern SIGNATURE_METHOD_PATTERN = Pattern.compile("<ds:SignatureMethod\\s+Algorithm=\"([^\"]+)\"");
    private static final String REQUIRED_GOST_512 = "gostr34102015-gostr34112015-512";

    private SignXml() {}

    public static void main(String[] args) throws Exception {
        if (args.length < 1 || args.length > 2) {
            System.err.println("Usage: SignXml <certificate-path> [certificate-pin]");
            System.exit(2);
        }

        String certificatePath = args[0];
        String certificatePin = args.length == 2 ? args[1] : System.getenv("ESF_CERT_PIN");
        String xml = new String(System.in.readAllBytes(), StandardCharsets.UTF_8);

        if (certificatePin == null || certificatePin.trim().isEmpty()) {
            System.err.println("Certificate PIN is empty");
            System.exit(2);
        }

        if (xml.trim().isEmpty()) {
            System.err.println("XML stdin is empty");
            System.exit(2);
        }

        KncaXS.loadXMLSecurity();
        if (Security.getProvider(KalkanProvider.PROVIDER_NAME) == null) {
            Security.addProvider(new KalkanProvider());
        }

        X500PrivateCredential credential = TrustyUtils.loadCredentialFromFile(certificatePath, certificatePin);
        validateIin(xml, credential);

        SigningEntity signingEntity = new SigningEntity(
            credential.getPrivateKey(),
            Collections.singletonList(credential.getCertificate())
        );

        String signedXml = XMLUtil.createXmlSignature(
            signingEntity,
            xml,
            Security.getProvider(KalkanProvider.PROVIDER_NAME)
        );
        validateSignatureMethod(signedXml);
        verifySignedXml(signedXml);
        printDiagnostics(signedXml, credential.getCertificate());

        System.out.print(signedXml);
    }

    private static void validateIin(String xml, X500PrivateCredential credential) {
        Matcher matcher = IIN_PATTERN.matcher(xml);
        if (!matcher.find()) {
            return;
        }

        String iin = matcher.group(1);
        X500Principal principal = credential.getCertificate().getSubjectX500Principal();
        String subject = String.join(
            " ",
            principal.getName(),
            principal.getName(X500Principal.RFC1779),
            principal.getName(X500Principal.CANONICAL)
        );

        if (!subject.contains(iin)) {
            throw new IllegalArgumentException("certificate-iin-mismatch: selected certificate does not match configured IIN");
        }
    }

    private static void validateSignatureMethod(String signedXml) {
        Matcher matcher = SIGNATURE_METHOD_PATTERN.matcher(signedXml);
        if (!matcher.find()) {
            throw new IllegalArgumentException("signature-method-not-found");
        }

        String algorithm = matcher.group(1);
        if (!algorithm.contains(REQUIRED_GOST_512)) {
            throw new IllegalArgumentException(
                "unsupported-signature-method: " + algorithm + ". Select a GOST512 NCA certificate, not RSA."
            );
        }
    }

    private static void verifySignedXml(String signedXml) throws Exception {
        XMLUtil.verifyXmlSignature(
            XMLUtil.getDocument(signedXml),
            Security.getProvider(KalkanProvider.PROVIDER_NAME)
        );
    }

    private static void printDiagnostics(String signedXml, X509Certificate certificate) {
        String signatureMethod = signatureMethod(signedXml);
        System.err.println(
            "signXmlDiagnostics: localVerify=ok"
                + "; signatureMethod=" + signatureMethod
                + "; subject=" + redactDigits(certificate.getSubjectX500Principal().getName(X500Principal.RFC1779))
                + "; issuer=" + certificate.getIssuerX500Principal().getName(X500Principal.RFC1779)
                + "; notAfter=" + certificate.getNotAfter()
        );
    }

    private static String signatureMethod(String signedXml) {
        Matcher matcher = SIGNATURE_METHOD_PATTERN.matcher(signedXml);
        return matcher.find() ? matcher.group(1) : "unknown";
    }

    private static String redactDigits(String value) {
        return value.replaceAll("\\d", "*");
    }
}
