package handlers

import (
	"testing"
)

func TestMapRiskBandToStatus(t *testing.T) {
	tests := []struct {
		riskBand string
		expected string
		wantErr  bool
	}{
		{"STABLE", "STABLE", false},
		{"VULNERABLE", "VULNERABLE", false},
		{"CRITICAL", "HIGH_RISK", false},
		{"FAILING", "HIGH_RISK", false},
		{"UNKNOWN", "", true},
		{"", "", true},
	}

	for _, tt := range tests {
		t.Run(tt.riskBand, func(t *testing.T) {
			got, err := MapRiskBandToStatus(tt.riskBand)
			if (err != nil) != tt.wantErr {
				t.Errorf("MapRiskBandToStatus(%q) error = %v, wantErr %v", tt.riskBand, err, tt.wantErr)
				return
			}
			if got != tt.expected {
				t.Errorf("MapRiskBandToStatus(%q) = %v, want %v", tt.riskBand, got, tt.expected)
			}
		})
	}
}

func TestRound2Dec(t *testing.T) {
	tests := []struct {
		name     string
		input    float64
		expected float64
	}{
		{"no rounding needed", 123.45, 123.45},
		{"round up", 123.456, 123.46},
		{"round down", 123.454, 123.45},
		{"round half up", 123.455, 123.46},
		{"zero", 0.0, 0.0},
		{"negative", -123.456, -123.46},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := Round2Dec(tt.input)
			if got != tt.expected {
				t.Errorf("Round2Dec(%v) = %v, want %v", tt.input, got, tt.expected)
			}
		})
	}
}
