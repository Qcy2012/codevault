#include <iostream>
#include <string>
#include <vector>
#include <map>
#include <algorithm>
#include <sstream>
#include <iomanip>

struct FileStats {
    size_t totalLines = 0;
    size_t emptyLines = 0;
    size_t commentLines = 0;
    size_t codeLines = 0;
};

struct ProjectStats {
    size_t totalFiles = 0;
    size_t totalLines = 0;
    size_t totalEmpty = 0;
    size_t totalComment = 0;
    size_t totalCode = 0;
    std::map<std::string, size_t> languageStats;
};

// 核心统计逻辑（只负责接收一段代码字符串并分析）
FileStats analyzeCode(const std::string& code) {
    FileStats stats;
    std::istringstream stream(code);
    std::string line;
    bool inBlockComment = false;

    while (std::getline(stream, line)) {
        stats.totalLines++;
        line.erase(0, line.find_first_not_of(" \t\r\n"));
        if (!line.empty()) line.erase(line.find_last_not_of(" \t\r\n") + 1);

        if (line.empty()) {
            stats.emptyLines++;
            continue;
        }

        bool isComment = false;
        if (inBlockComment) {
            isComment = true;
            if (line.find("*/") != std::string::npos) inBlockComment = false;
        } else {
            if (line.rfind("//", 0) == 0 || line.rfind("#", 0) == 0) {
                isComment = true;
            } else if (line.rfind("/*", 0) == 0) {
                isComment = true;
                if (line.find("*/") == std::string::npos) inBlockComment = true;
            }
        }
        if (isComment) stats.commentLines++;
        else stats.codeLines++;
    }
    return stats;
}

// 主函数：负责从 Node.js 接收数据并输出结果
int main() {
    ProjectStats project;
    std::string line;
    std::string currentLang = "";
    std::string currentCode = "";
    bool readingCode = false;

    while (std::getline(std::cin, line)) {
        // 去除 Windows 下的换行符残留 \r
        if (!line.empty() && line.back() == '\r') {
            line.pop_back();
        }

        if (line.rfind("LANG:", 0) == 0) {
            currentLang = line.substr(5);
        } else if (line == "CODE_START") {
            currentCode = "";
            readingCode = true;
        } else if (line == "CODE_END") {
            readingCode = false;
            FileStats stat = analyzeCode(currentCode);
            if (stat.totalLines > 0) {
                project.totalFiles++;
                project.totalLines += stat.totalLines;
                project.totalEmpty += stat.emptyLines;
                project.totalComment += stat.commentLines;
                project.totalCode += stat.codeLines;
                project.languageStats[currentLang] += stat.codeLines;
            }
        } else if (readingCode) {
            currentCode += line + "\n";
        }
    }

    // 输出 JSON
    std::cout << "{\n";
    std::cout << "  \"totalFiles\": " << project.totalFiles << ",\n";
    std::cout << "  \"totalLines\": " << project.totalLines << ",\n";
    std::cout << "  \"emptyLines\": " << project.totalEmpty << ",\n";
    std::cout << "  \"commentLines\": " << project.totalComment << ",\n";
    std::cout << "  \"codeLines\": " << project.totalCode << ",\n";
    std::cout << "  \"languages\": {\n";
    size_t count = 0;
    for (const auto& [ext, lines] : project.languageStats) {
        std::cout << "    \"" << ext << "\": " << lines;
        if (++count < project.languageStats.size()) std::cout << ",";
        std::cout << "\n";
    }
    std::cout << "  }\n}\n";

    return 0;
}
