package models

// AreaSummary defines the strict Go struct representing an operational grid area payload required by the frontend.
type AreaSummary struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	State string `json:"state"`
}
