package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"

	"github.com/joho/godotenv"
)

func main() {
	// Require the Hugging Face token to be passed as an environment variable to the script itself
	hfToken := os.Getenv("HF_TOKEN")
	if hfToken == "" {
		fmt.Println("Error: HF_TOKEN environment variable is required")
		fmt.Println("Usage: HF_TOKEN=hf_YOUR_FINE_GRAINED_WRITE_TOKEN go run upload_secrets.go")
		os.Exit(1)
	}

	spaceID := "Sliverboy/heal-her-backend"

	// Read the local .env file directly into a map
	secrets, err := godotenv.Read(".env")
	if err != nil {
		fmt.Printf("Error reading .env file: %v\n", err)
		os.Exit(1)
	}

	for key, value := range secrets {
		uploadSecret(spaceID, hfToken, key, value)
	}
}

func uploadSecret(spaceID, token, key, value string) {
	url := fmt.Sprintf("https://huggingface.co/api/spaces/%s/secrets", spaceID)

	payload := map[string]string{
		"key":   key,
		"value": value,
	}
	jsonPayload, _ := json.Marshal(payload)

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonPayload))
	if err != nil {
		fmt.Printf("Failed to create request for %s: %v\n", key, err)
		return
	}

	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		fmt.Printf("Request failed for %s: %v\n", key, err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusOK || resp.StatusCode == http.StatusCreated {
		fmt.Printf("Successfully uploaded secret: %s\n", key)
	} else {
		bodyBytes, _ := io.ReadAll(resp.Body)
		fmt.Printf("Failed to upload %s. Status: %d, Response: %s\n", key, resp.StatusCode, string(bodyBytes))
	}
}
