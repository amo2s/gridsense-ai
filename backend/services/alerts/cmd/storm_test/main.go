package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"sync"
	"sync/atomic"
	"time"

	"github.com/ThreeDotsLabs/watermill"
	"github.com/ThreeDotsLabs/watermill-redisstream/pkg/redisstream"
	"github.com/ThreeDotsLabs/watermill/message"
	"github.com/google/uuid"
	"github.com/joho/godotenv"
	"github.com/redis/go-redis/v9"
)

const (
	StreamName      = "gridsense:alerts:stream"
	TotalWorkers    = 20
	EventsPerWorker = 500
)

// SyntheticEvent mirrors domain.AnomalyPayload to satisfy strict JSON validation.
type SyntheticEvent struct {
	EventID         string                 `json:"event_id"`
	TraceID         string                 `json:"trace_id"`
	Type            string                 `json:"type"`
	Timestamp       time.Time              `json:"timestamp"`
	Source          string                 `json:"source"`
	FeederID        string                 `json:"feeder_id"`
	RiskScore       float64                `json:"risk_score"`
	Severity        string                 `json:"severity"`
	MetricsSnapshot map[string]interface{} `json:"metrics_snapshot"`
}

func main() {
	// Load .env file automatically so we don't have to export variables manually
	if err := godotenv.Load(); err != nil {
		fmt.Println("No .env file found; falling back to system environment variables")
	}

	redisURL := os.Getenv("UPSTASH_REDIS_URL")
	if redisURL == "" {
		log.Fatal("UPSTASH_REDIS_URL environment variable is required")
	}

	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		log.Fatalf("Failed to parse Redis URL: %v", err)
	}

	client := redis.NewClient(opts)
	ctx := context.Background()

	// Verify connection
	if err := client.Ping(ctx).Err(); err != nil {
		log.Fatalf("Redis connection failed: %v", err)
	}
	fmt.Println("Connected to Upstash Redis. Starting Alert Storm Simulation...")

	// Initialize Watermill Redis Publisher to ensure correct payload formatting
	publisher, err := redisstream.NewPublisher(
		redisstream.PublisherConfig{
			Client:     client,
			Marshaller: redisstream.DefaultMarshallerUnmarshaller{},
		},
		watermill.NewStdLogger(false, false),
	)
	if err != nil {
		log.Fatalf("Failed to initialize Watermill publisher: %v", err)
	}
	defer publisher.Close()

	var wg sync.WaitGroup
	var successCount int32
	var errorCount int32

	startTime := time.Now()

	// Shared fingerprint to simulate a massive storm of the exact same error
	stormFingerprint := "FINGERPRINT-STORM-" + uuid.New().String()[:8]

	for w := 1; w <= TotalWorkers; w++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			
			for i := 1; i <= EventsPerWorker; i++ {
				// 50% chance to be a duplicate storm event, 50% chance to be unique
				fingerprint := stormFingerprint
				feeder := "FDR-MAIN-01"
				if i%2 == 0 {
					fingerprint = fmt.Sprintf("FINGERPRINT-UNIQUE-%d-%d", workerID, i)
					feeder = fmt.Sprintf("FDR-SUB-%d", workerID)
				}

				event := SyntheticEvent{
					EventID:   uuid.New().String(),
					TraceID:   uuid.New().String(),
					Type:      "FEEDER_ANOMALY",
					Timestamp: time.Now(),
					Source:    "storm_simulator",
					FeederID:  feeder,
					RiskScore: 95.0,
					Severity:  "CRITICAL",
					MetricsSnapshot: map[string]interface{}{
						"fingerprint": fingerprint,
					},
				}

				payload, _ := json.Marshal(event)

				msg := message.NewMessage(event.EventID, payload)

				// Publish to Watermill-compatible Redis Stream using the official Publisher
				err := publisher.Publish(StreamName, msg)

				if err != nil {
					atomic.AddInt32(&errorCount, 1)
				} else {
					atomic.AddInt32(&successCount, 1)
				}
			}
		}(w)
	}

	wg.Wait()
	duration := time.Since(startTime)

	fmt.Println("========================================")
	fmt.Printf("Storm Simulation Complete in %v\n", duration)
	fmt.Printf("Total Events Dispatched: %d\n", successCount)
	fmt.Printf("Failed Dispatches: %d\n", errorCount)
	fmt.Printf("Throughput: %.2f events/sec\n", float64(successCount)/duration.Seconds())
	fmt.Println("========================================")
	fmt.Println("Next Step: Check your Watermill consumer logs to verify the deduplication engine absorbed the storm without database bottlenecks.")
}