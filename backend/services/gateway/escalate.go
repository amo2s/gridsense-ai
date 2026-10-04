package main

import (
	"context"
	"fmt"
	"os"

	"github.com/jackc/pgx/v5"
	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load(".env")
	dbUrl := os.Getenv("DATABASE_URL")
	if dbUrl == "" {
		fmt.Println("No DATABASE_URL")
		return
	}

	conn, err := pgx.Connect(context.Background(), dbUrl)
	if err != nil {
		fmt.Printf("Unable to connect to database: %v\n", err)
		os.Exit(1)
	}
	defer conn.Close(context.Background())

	tag, err := conn.Exec(context.Background(), "UPDATE users SET role = 'admin' WHERE email = 'nwakaamos95@gmail.com'")
	if err != nil {
		fmt.Printf("Query failed: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("Rows updated: %d\n", tag.RowsAffected())
}
