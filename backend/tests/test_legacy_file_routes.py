def test_server_file_upload_route_is_not_available(client) -> None:
    response = client.post("/api/works/upload")

    assert response.status_code == 404


def test_server_file_download_route_is_not_available(client) -> None:
    response = client.get("/api/works/1/download")

    assert response.status_code == 404
