import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.GeneralSecurityException;
import java.security.Key;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.UnrecoverableKeyException;
import java.util.Arrays;

public class ValidateAndroidKeystore {
    private static String requiredEnvironment(String name) {
        String value = System.getenv(name);
        if (value == null || value.isEmpty()) {
            fail("Credencial de assinatura não informada: " + name);
        }
        return value;
    }

    private static void fail(String message) {
        System.err.println(message);
        System.exit(1);
    }

    public static void main(String[] args) throws GeneralSecurityException {
        Path keystorePath = Path.of(requiredEnvironment("ANDROID_KEYSTORE_FILE"));
        String alias = requiredEnvironment("ANDROID_KEY_ALIAS");
        char[] storePassword = requiredEnvironment("ANDROID_KEYSTORE_PASSWORD").toCharArray();
        char[] keyPassword = requiredEnvironment("ANDROID_KEY_PASSWORD").toCharArray();

        try {
            KeyStore store = KeyStore.getInstance("JKS");
            try (InputStream input = Files.newInputStream(keystorePath)) {
                store.load(input, storePassword);
            } catch (IOException error) {
                fail("Não foi possível abrir o keystore. Confira a senha do keystore e o arquivo selecionado.");
            }

            if (!store.isKeyEntry(alias)) {
                fail("Alias da chave não encontrado no keystore: " + alias);
            }

            try {
                Key key = store.getKey(alias, keyPassword);
                if (!(key instanceof PrivateKey)) {
                    fail("O alias selecionado não contém uma chave privada.");
                }
            } catch (UnrecoverableKeyException error) {
                fail("Senha da chave incorreta. Se você usou a mesma senha do keystore ao criar a chave, pressione Enter nesse campo do script.");
            }

            System.out.println("Keystore, alias e senhas verificados. Iniciando a compilação Android.");
        } finally {
            Arrays.fill(storePassword, '\0');
            Arrays.fill(keyPassword, '\0');
        }
    }
}
