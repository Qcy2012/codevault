#include <iostream>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>
#include <curl/curl.h>
#include <algorithm>
#include <filesystem>

using namespace std;
namespace fs = std::filesystem;

size_t WriteCallback(void* contents, size_t size, size_t nmemb, void* userp) {
    ((string*)userp)->append((char*)contents, size * nmemb);
    return size * nmemb;
}

string escapeJSON(const string& input) {
    string output;
    for (char c : input) {
        switch (c) {
            case '"': output += "\\\""; break;
            case '\\': output += "\\\\"; break;
            case '\n': output += "\\n"; break;
            case '\r': output += "\\r"; break;
            case '\t': output += "\\t"; break;
            default: output += c; break;
        }
    }
    return output;
}

string extractJSONValue(const string& json, const string& key) {
    string searchKey = "\"" + key + "\"";
    size_t keyPos = json.find(searchKey);
    if (keyPos == string::npos) return "";

    size_t colonPos = json.find(':', keyPos);
    if (colonPos == string::npos) return "";

    size_t quoteStart = json.find('"', colonPos);
    if (quoteStart == string::npos) return "";

    size_t quoteEnd = json.find('"', quoteStart + 1);
    if (quoteEnd == string::npos) return "";

    return json.substr(quoteStart + 1, quoteEnd - quoteStart - 1);
}

string getLanguage(const string& filename) {
    size_t dotPos = filename.find_last_of('.');
    if (dotPos == string::npos) return "other";
    string ext = filename.substr(dotPos + 1);
    transform(ext.begin(), ext.end(), ext.begin(), ::tolower);
    
    if (ext == "cpp" || ext == "cc" || ext == "h" || ext == "hpp") return "cpp";
    if (ext == "py") return "python";
    if (ext == "js" || ext == "ts") return "javascript";
    if (ext == "html") return "html";
    if (ext == "css") return "css";
    return "other";
}

bool ensureConfigExists(const string& configPath) {
    if (!fs::exists(configPath)) {
        ofstream out(configPath);
        out << "{\n";
        out << "  \"apiKey\": \"Your_API_KEY\",\n";
        out << "  \"serverUrl\": \"http://127.0.0.1:3000\"\n";
        out << "}\n";
        out.close();
        cout << "[INFO] The first run: The config file has generated automatically at: " << configPath << "\n";
        cout << "[INFO] Please open it with an text editor, fill in your API Key and restart the CLI.\n";
        return false;
    }
    return true;
}

int main(int argc, char* argv[]) {
    if (argc < 2) {
        cerr << "[INFO] Usage: cv-cli <File Path>\n";
        return 1;
    }

    fs::path exePath = fs::absolute(argv[0]);
    string configPath = (exePath.parent_path() / "config.json").string();

    if (!ensureConfigExists(configPath)) {
        return 1;
    }

    ifstream configFile(configPath);
    if (!configFile.is_open()) {
        cerr << "[ERROR] Cannot open the config file: " << configPath << "\n";
        return 1;
    }
    stringstream configBuffer;
    configBuffer << configFile.rdbuf();
    string configJson = configBuffer.str();
    configFile.close();

    string apiKey = extractJSONValue(configJson, "apiKey");
    string serverUrl = extractJSONValue(configJson, "serverUrl");

    if (apiKey.empty() || apiKey == "Your_API_KEY") {
        cerr << "[ERROR] Please config the correct API Key in " << configPath << " !\n";
        return 1;
    }
    if (serverUrl.empty()) {
        serverUrl = "http://127.0.0.1:3000";
    }
    if (serverUrl.back() == '/') serverUrl.pop_back();

    string filePath = argv[1];
    ifstream file(filePath, ios::binary);
    if (!file.is_open()) {
        cerr << "[ERROR] Cannot open code file: " << filePath << "\n";
        return 1;
    }
    stringstream buffer;
    buffer << file.rdbuf();
    string code = buffer.str();
    file.close();

    size_t slashPos = filePath.find_last_of("/\\");
    string fileName = (slashPos == string::npos) ? filePath : filePath.substr(slashPos + 1);
    string language = getLanguage(fileName);

    string jsonPayload = "{\n";
    jsonPayload += "  \"title\": \"" + escapeJSON(fileName) + "\",\n";
    jsonPayload += "  \"language\": \"" + language + "\",\n";
    jsonPayload += "  \"code\": \"" + escapeJSON(code) + "\",\n";
    jsonPayload += "  \"is_public\": true,\n";
    jsonPayload += "  \"tags\": [\"cli\", \"auto-sync\"]\n";
    jsonPayload += "}";

    CURL* curl = curl_easy_init();
    if (!curl) {
        cerr << "[ERROR] Failed to initialize libcurl\n";
        return 1;
    }

    string readBuffer;
    string url = serverUrl + "/api/snippets";
    
    struct curl_slist* headers = NULL;
    headers = curl_slist_append(headers, "Content-Type: application/json");
    string apiKeyHeader = "X-API-KEY: " + apiKey;
    headers = curl_slist_append(headers, apiKeyHeader.c_str());

    curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
    curl_easy_setopt(curl, CURLOPT_POST, 1L);
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
    curl_easy_setopt(curl, CURLOPT_POSTFIELDS, jsonPayload.c_str());
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, WriteCallback);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &readBuffer);

    string certPath = (exePath.parent_path() / "cacert.pem").string();
    if (fs::exists(certPath)) {
        curl_easy_setopt(curl, CURLOPT_CAINFO, certPath.c_str());
    } else {
        cout << "[WARN] Warning: Cannot find the certificate file " << certPath << ", it may fail if it is an HTTP request.\n";
    }

    cout << "[INFO] Pushing [" << fileName << "] to " << serverUrl << "...\n";
    
    CURLcode res = curl_easy_perform(curl);
    
    if (res != CURLE_OK) {
        cerr << "[ERROR] Network request failed: " << curl_easy_strerror(res) << "\n";
    } else {
        long httpCode = 0;
        curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &httpCode);
        if (httpCode == 201) {
            cout << "[INFO] Push sccessfully!\n";
        } else {
            cout << "[ERROR] Push failed,HTTP code: " << httpCode << "\n";
            cout << "[ERROR] The server returns: " << readBuffer << "\n";
        }
    }

    curl_easy_cleanup(curl);
    curl_slist_free_all(headers);

    return 0;
}
