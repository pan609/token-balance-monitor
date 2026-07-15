import Foundation

enum QuotaL10n {
    static var isChinese: Bool {
        Locale.autoupdatingCurrent.language.languageCode?.identifier.lowercased().hasPrefix("zh") == true
    }

    static func text(_ zh: String, _ en: String) -> String {
        isChinese ? zh : en
    }

    static func status(_ status: String, fallback: String? = nil) -> String {
        switch status {
        case "ok":
            return text("充足", "Good")
        case "warning":
            return text("偏低", "Low")
        case "critical":
            return text("紧张", "Critical")
        case "stale":
            return text("可能过期", "Possibly stale")
        case "unknown":
            return text("待确认", "Unknown")
        default:
            return localizedKnownText(fallback ?? status)
        }
    }

    static func windowLabel(id: String, fallback: String? = nil) -> String {
        switch id {
        case "5h":
            return text("5 小时", "5h")
        case "weekly", "7d":
            return text("每周", "Weekly")
        case "monthly":
            return text("本月", "Monthly")
        default:
            return localizedKnownText(fallback ?? id)
        }
    }

    static func quotaValueText(
        remainingText: String?,
        remainingPercent: Double?
    ) -> String {
        if let remainingText {
            let trimmed = remainingText.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty {
                return localizedAmountText(trimmed)
            }
        }
        guard let remainingPercent else { return "--" }
        return "\(Int(remainingPercent.rounded()))%"
    }

    static func resetText(resetsAt: Date?, fallbackStatus: String? = nil) -> String {
        guard let resetsAt else {
            return fallbackStatus.map(localizedKnownText) ?? text("等待重置时间", "Waiting for reset")
        }
        if isChinese {
            return "\(relativeResetText(resetsAt))重置"
        }
        return "resets \(relativeResetText(resetsAt))"
    }

    static func relativeResetText(_ date: Date) -> String {
        let seconds = date.timeIntervalSinceNow
        if seconds <= 0 { return text("即将", "Soon") }
        let minutes = Int(seconds / 60)
        if minutes < 60 {
            return text("\(max(1, minutes)) 分钟后", "in \(max(1, minutes))m")
        }
        let hours = minutes / 60
        if hours < 24 {
            return text("\(hours) 小时后", "in \(hours)h")
        }
        let days = max(1, hours / 24)
        return text("\(days) 天后", "in \(days)d")
    }

    static func updatedAt(_ date: Date) -> String {
        text("更新于 \(date.compactTimeText)", "Updated \(date.compactTimeText)")
    }

    static func watchUpdatedAt(_ date: Date) -> String {
        text("查 \(date.quotaWatchTimeText)", "Checked \(date.quotaWatchTimeText)")
    }

    static func complicationUpdatedAt(_ date: Date) -> String {
        text("更新 \(date.quotaComplicationClockTimeText)", "Updated \(date.quotaComplicationClockTimeText)")
    }

    static func itemCount(_ count: Int) -> String {
        text("\(count) 项", "\(count) items")
    }

    static func headerTitle(for serviceName: String) -> String {
        if serviceName.localizedCaseInsensitiveContains("claude") {
            return text("Claude 额度", "Claude Quota")
        }
        if serviceName.localizedCaseInsensitiveContains("codex") {
            return text("Codex 额度", "Codex Quota")
        }
        return "AI Quota"
    }

    static func localizedKnownText(_ value: String) -> String {
        let normalized = value.trimmingCharacters(in: .whitespacesAndNewlines)
        switch normalized {
        case "额度":
            return text("额度", "Quota")
        case "订阅额度":
            return text("订阅额度", "Subscription quota")
        case "等待同步", "待同步":
            return text("等待同步", "Waiting to sync")
        case "偏低":
            return text("偏低", "Low")
        case "充足":
            return text("充足", "Good")
        case "紧张":
            return text("紧张", "Critical")
        case "可能过期":
            return text("可能过期", "Possibly stale")
        case "本月":
            return text("本月", "Monthly")
        case "每周":
            return text("每周", "Weekly")
        case "5 小时":
            return text("5 小时", "5h")
        default:
            return normalized
        }
    }

    private static func localizedAmountText(_ textValue: String) -> String {
        var result = textValue
            .replacingOccurrences(of: " 剩余", with: "")
            .replacingOccurrences(of: " 可用", with: "")
            .replacingOccurrences(of: "剩余", with: "")
            .replacingOccurrences(of: "可用", with: "")
            .replacingOccurrences(of: " remaining", with: "", options: .caseInsensitive)
            .replacingOccurrences(of: " available", with: "", options: .caseInsensitive)

        if !isChinese {
            result = result.replacingOccurrences(of: "约 ", with: "~")
        }
        return result.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

extension Date {
    var quotaWatchTimeText: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm:ss"
        return formatter.string(from: self)
    }

    var quotaComplicationClockTimeText: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: self)
    }
}
