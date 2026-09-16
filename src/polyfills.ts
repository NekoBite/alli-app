/**
 * Must be imported before ethers touches anything. Hermes has no
 * `crypto.getRandomValues`, which ethers needs for key/nonce generation.
 *
 * Imported once, at the top of app/_layout.tsx.
 */
import 'react-native-get-random-values';
