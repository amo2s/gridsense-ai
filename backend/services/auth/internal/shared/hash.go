package shared

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"
)

// ErrInvalidHash is returned when the stored hash is corrupted or tampered with.
var ErrInvalidHash = errors.New("the encoded hash is not in the correct format")

// ArgonConfig holds the tuning parameters for the Argon2id algorithm.
type ArgonConfig struct {
	Time    uint32 // Iterations (CPU cost)
	Memory  uint32 // Memory cost in kilobytes (64MB = 64 * 1024)
	Threads uint8  // Parallelism (number of threads)
	KeyLen  uint32 // Length of the generated hash key
	SaltLen uint32 // Length of the random cryptographic salt
}

// DefaultArgonConfig returns OWASP-recommended parameters for 2026.
// These parameters are specifically chosen to maximize resistance against GPU-based brute-force attacks.
func DefaultArgonConfig() *ArgonConfig {
	return &ArgonConfig{
		Time:    3,
		Memory:  64 * 1024, // 64 MB
		Threads: 2,
		KeyLen:  32, // 256 bits
		SaltLen: 16, // 128 bits
	}
}

// HashPassword generates a secure Argon2id hash from a plaintext password.
// It returns a standard PHC formatted string.
func HashPassword(password string) (string, error) {
	cfg := DefaultArgonConfig()

	// 1. Generate a cryptographically secure random salt
	salt := make([]byte, cfg.SaltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("failed to generate random salt: %w", err)
	}

	// 2. Execute the Argon2id key derivation function
	hash := argon2.IDKey([]byte(password), salt, cfg.Time, cfg.Memory, cfg.Threads, cfg.KeyLen)

	// 3. Encode to PHC format: $argon2id$v=19$m=65536,t=3,p=2$<base64_salt>$<base64_hash>
	b64Salt := base64.RawStdEncoding.EncodeToString(salt)
	b64Hash := base64.RawStdEncoding.EncodeToString(hash)

	encodedHash := fmt.Sprintf(
		"$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version, cfg.Memory, cfg.Time, cfg.Threads, b64Salt, b64Hash,
	)

	return encodedHash, nil
}

// VerifyPassword compares a plaintext password against a stored PHC Argon2id hash.
// It safely extracts the unique parameters used to hash the original password.
func VerifyPassword(password, encodedHash string) (bool, error) {
	// 1. Split the PHC string into its standard components
	parts := strings.Split(encodedHash, "$")
	if len(parts) != 6 {
		return false, ErrInvalidHash
	}

	// 2. Validate the algorithm and version
	if parts[1] != "argon2id" {
		return false, errors.New("unsupported hashing algorithm")
	}

	var version int
	_, err := fmt.Sscanf(parts[2], "v=%d", &version)
	if err != nil || version != argon2.Version {
		return false, errors.New("incompatible argon2 version")
	}

	// 3. Extract the exact memory, iterations, and thread parameters used for this specific hash
	var memory uint32
	var time uint32
	var threads uint8
	_, err = fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &memory, &time, &threads)
	if err != nil {
		return false, ErrInvalidHash
	}

	// 4. Decode the salt and the original hash from Base64
	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return false, ErrInvalidHash
	}

	decodedHash, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		return false, ErrInvalidHash
	}

	// 5. Re-hash the incoming password attempt using the extracted parameters
	keyLen := uint32(len(decodedHash))
	comparisonHash := argon2.IDKey([]byte(password), salt, time, memory, threads, keyLen)

	// 6. Brutal Security: Constant-Time Comparison
	// This prevents attackers from measuring how many microseconds the comparison takes
	// to guess characters of the hash.
	if subtle.ConstantTimeCompare(decodedHash, comparisonHash) == 1 {
		return true, nil
	}

	return false, nil
}