import kz.gov.pki.kalkan.jce.provider.KalkanProvider;
import kz.gov.pki.kalkan.xmldsig.KncaXS;
import kz.gov.pki.provider.utils.XMLUtil;
import kz.gov.pki.provider.utils.model.SigningEntity;
import ru.ussgroup.security.trusty.TrustyUtils;

import javax.security.auth.x500.X500PrivateCredential;
import java.nio.charset.StandardCharsets;
import java.security.Security;
import java.util.Collections;

public final class SignXml {
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
        SigningEntity signingEntity = new SigningEntity(
            credential.getPrivateKey(),
            Collections.singletonList(credential.getCertificate())
        );

        String signedXml = XMLUtil.createXmlSignature(
            signingEntity,
            xml,
            Security.getProvider(KalkanProvider.PROVIDER_NAME)
        );

        System.out.print(signedXml);
    }
}
