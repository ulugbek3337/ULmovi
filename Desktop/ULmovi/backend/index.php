<?php
// ULmovi Backend API (Routing and Database Connection)
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");

echo json_encode(["status" => "success", "message" => "ULmovi Backend is running!"]);
?>