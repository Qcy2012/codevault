#include <iostream>
#include <filesystem>
#include <fstream>
#include <string>
#include <vector>
#include <map>
#include <iomanip>
#include <algorithm>

namespace fs = std::filesystem;

// 支持的代码文件扩展名
const std::vector<std::string> SUPPORTED_EXTS = {
    ".cpp", ".h", ".hpp", ".c", ".cc", ".js", ".ts", ".py", ".html", ".css"
};

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
    std::map<std::string, size_t> languageStats; // 扩展名 -> 行数
};

// 判断是否是需要统计的文件
bool isSupportedFile(const fs::path& path) {
    std::string ext = path.extension().string();
    std::transform(ext.begin(), ext.end(), ext.begin(), ::tolower);
    return std::find(SUPPORTED_EXTS.begin(), SUPPORTED_EXTS.end(), ext) != SUPPORTED_EXTS.end();
}

// 核心统计逻辑（简单的状态机，处理单行和多行注释）
FileStats analyzeFile(const fs::path& path) {
    std::ifstream file(path);
    FileStats stats;
    std::string line;
    
    bool inBlockComment = false;

    while (std::getline(file, line)) {
        stats.totalLines++;
        
        // 去除首尾空白
        line.erase(0, line.find_first_not_of(" \t\r\n"));
        if (!line.empty()) {
            line.erase(line.find_last_not_of(" \t\r\n") + 1);
        }

        if (line.empty()) {
            stats.emptyLines++;
            continue;
        }

        bool isComment = false;

        if (inBlockComment) {
            isComment = true;
            if (line.find("*/") != std::string::npos) {
                inBlockComment = false;
            }
        } else {
            if (line.rfind("//", 0) == 0 || line.rfind("#", 0) == 0) {
                isComment = true;
            } else if (line.rfind("/*", 0) == 0) {
                isComment = true;
                if (line.find("*/") == std::string::npos) {
                    inBlockComment = true;
                }
            }
        }

        if (isComment) {
            stats.commentLines++;
        } else {
            stats.codeLines++;
        }
    }
    return stats;
}

void printReport(const ProjectStats& stats) {
    std::cout << "\n=========================================\n";
    std::cout << "          CodeVault C++ 代码统计报告\n";
    std::cout << "=========================================\n";
    std::cout << std::left << std::setw(15) << "总文件数:" << stats.totalFiles << "\n";
    std::cout << std::left << std::setw(15) << "总行数:" << stats.totalLines << "\n";
    std::cout << std::left << std::setw(15) << "空行数:" << stats.totalEmpty << "\n";
    std::cout << std::left << std::setw(15) << "注释行数:" << stats.totalComment << "\n";
    std::cout << std::left << std::setw(15) << "实际代码行数:" << stats.totalCode << "\n";
    
    if (stats.totalLines > 0) {
        double commentRatio = (double)stats.totalComment / stats.totalLines * 100;
        std::cout << std::left << std::setw(15) << "注释比例:" << std::fixed << std::setprecision(2) << commentRatio << "%\n";
    }
    
    std::cout << "\n--- 语言分布 (按代码行数) ---\n";
    for (const auto& [ext, lines] : stats.languageStats) {
        std::cout << std::left << std::setw(10) << ext << ": " << lines << " 行\n";
    }
    std::cout << "=========================================\n\n";
}

// 生成 JSON 供前端读取
void generateJSON(const ProjectStats& stats, const std::string& outPath) {
    std::ofstream out(outPath);
    out << "{\n";
    out << "  \"totalFiles\": " << stats.totalFiles << ",\n";
    out << "  \"totalLines\": " << stats.totalLines << ",\n";
    out << "  \"emptyLines\": " << stats.totalEmpty << ",\n";
    out << "  \"commentLines\": " << stats.totalComment << ",\n";
    out << "  \"codeLines\": " << stats.totalCode << ",\n";
    out << "  \"languages\": {\n";
    
    size_t count = 0;
    for (const auto& [ext, lines] : stats.languageStats) {
        out << "    \"" << ext << "\": " << lines;
        if (++count < stats.languageStats.size()) out << ",";
        out << "\n";
    }
    out << "  }\n";
    out << "}\n";
    out.close();
    std::cout << "? JSON 数据已生成: " << outPath << "\n";
}

int main(int argc, char* argv[]) {
    std::string targetDir = ".";
    bool outputJsonToConsole = false;
    
    // 解析参数
    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];
        if (arg == "--json") {
            outputJsonToConsole = true;
        } else {
            targetDir = arg;
        }
    }

    if (!fs::exists(targetDir) || !fs::is_directory(targetDir)) {
        std::cerr << "{\"error\": \"Directory not found\"}\n";
        return 1;
    }

    ProjectStats project;
    // 显式使用迭代器
    for (auto it = fs::recursive_directory_iterator(targetDir); it != fs::recursive_directory_iterator(); ++it) {
        const auto& entry = *it;
        
        if (entry.is_directory()) {
            std::string dirName = entry.path().filename().string();
            // 如果是这些目录，跳过并【停止递归】
            if (dirName == "node_modules" || dirName == ".git" || dirName == "dist" || dirName == ".vercel") {
                it.disable_recursion_pending(); // 在迭代器上调用
                continue;
            }
        }
        
        if (entry.is_regular_file() && isSupportedFile(entry.path())) {
            FileStats fileStat = analyzeFile(entry.path());
            if (fileStat.totalLines == 0) continue;

            project.totalFiles++;
            project.totalLines += fileStat.totalLines;
            project.totalEmpty += fileStat.emptyLines;
            project.totalComment += fileStat.commentLines;
            project.totalCode += fileStat.codeLines;

            std::string ext = entry.path().extension().string();
            std::transform(ext.begin(), ext.end(), ext.begin(), ::tolower);
            project.languageStats[ext] += fileStat.codeLines;
        }
    }

    if (outputJsonToConsole) {
        // 直接打印 JSON 供 Node.js 抓取
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
    } else {
        printReport(project);
        generateJSON(project, "stats.json");
    }
    return 0;
}
