import kz.gov.pki.kalkan.jce.provider.KalkanProvider;
import ru.ussgroup.security.trusty.TrustyUtils;

import javax.security.auth.x500.X500PrivateCredential;
import java.nio.charset.StandardCharsets;
import java.security.Security;
import java.security.Signature;
import java.security.cert.X509Certificate;
import java.util.Base64;

public final class SignRaw {
    private SignRaw() {}

    public static void main(String[] args) throws Exception {
        if (args.length < 1 || args.length > 2) {
            System.err.println("Usage: SignRaw <certificate-path> [certificate-pin]");
            System.exit(2);
        }

        String certificatePath = args[0];
        String certificatePin = args.length == 2 ? args[1] : System.getenv("ESF_CERT_PIN");
        String data = new String(System.in.readAllBytes(), StandardCharsets.UTF_8);

        if (certificatePin == null || certificatePin.trim().isEmpty()) {
            System.err.println("Certificate PIN is empty");
            System.exit(2);
        }

        if (data.trim().isEmpty()) {
            System.err.println("Raw signing stdin is empty");
            System.exit(2);
        }

        if (Security.getProvider(KalkanProvider.PROVIDER_NAME) == null) {
            Security.addProvider(new KalkanProvider());
        }

        X500PrivateCredential credential = TrustyUtils.loadCredentialFromFile(certificatePath, certificatePin);
        Signature signer = Signature.getInstance("ECGOST3410-2015-512", KalkanProvider.PROVIDER_NAME);
        signer.initSign(credential.getPrivateKey());
        signer.update(data.getBytes(StandardCharsets.UTF_8));

        String signature = Base64.getEncoder().encodeToString(signer.sign());
        X509Certificate certificate = credential.getCertificate();
        String certificateBase64 = Base64.getEncoder().encodeToString(certificate.getEncoded());

        System.err.println(
            "signRawDiagnostics: algorithm=ECGOST3410-2015-512"
                + "; signatureLength=" + signature.length()
                + "; certificateSubject=" + certificate.getSubjectX500Principal().getName()
        );
        System.out.print("{\"certificate\":\"" + certificateBase64 + "\",\"signature\":\"" + signature + "\"}");
    }
}
