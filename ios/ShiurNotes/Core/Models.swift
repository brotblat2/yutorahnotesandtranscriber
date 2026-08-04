import Foundation

enum AppTab: Hashable {
    case home
    case library
    case settings
}

enum AppRoute: Hashable {
    case confirmation
    case processing
    case reader(UUID)
}

enum GenerationKind: String, CaseIterable, Identifiable, Hashable {
    case notes
    case transcript

    var id: Self { self }

    var title: String {
        switch self {
        case .notes: "Notes"
        case .transcript: "Transcript"
        }
    }

    var systemImage: String {
        switch self {
        case .notes: "doc.text"
        case .transcript: "text.quote"
        }
    }
}

enum NoteDetail: String, CaseIterable, Identifiable, Hashable {
    case concise
    case standard
    case comprehensive

    var id: Self { self }

    var title: String {
        rawValue.capitalized
    }
}

enum SourceChoice: String, Identifiable, Hashable {
    case link
    case audio
    case clipboard

    var id: Self { self }
}

enum GenerationStage: Int, CaseIterable, Identifiable, Hashable {
    case retrieving
    case preparing
    case generating
    case saving
    case complete

    var id: Self { self }

    var title: String {
        switch self {
        case .retrieving: "Retrieving audio"
        case .preparing: "Preparing secure upload"
        case .generating: "Generating organized notes"
        case .saving: "Saving to your library"
        case .complete: "Complete"
        }
    }

    var systemImage: String {
        switch self {
        case .retrieving: "arrow.down.circle"
        case .preparing: "waveform"
        case .generating: "sparkles"
        case .saving: "square.and.arrow.down"
        case .complete: "checkmark.circle.fill"
        }
    }
}

struct ShiurDraft: Hashable {
    var sourceURL = "https://www.yutorah.org/lectures/1154805"
    var title = "The Nature of Tefillah"
    var speaker = "Rav Michael Rosensweig"
    var source = "YUTorah"
    var duration = "54 min"
    var kind: GenerationKind = .notes
    var detail: NoteDetail = .comprehensive
}

struct ShiurItem: Identifiable, Hashable {
    let id: UUID
    var title: String
    var speaker: String
    var source: String
    var duration: String
    var kind: GenerationKind
    var createdAt: Date
    var content: String

    var dateLabel: String {
        createdAt.formatted(date: .abbreviated, time: .omitted)
    }

    static let samples: [ShiurItem] = [
        ShiurItem(
            id: UUID(uuidString: "7D18D7D4-49E4-44A6-A57F-CFA5C53331AD")!,
            title: "The Nature of Tefillah",
            speaker: "Rav Michael Rosensweig",
            source: "YUTorah",
            duration: "54 min",
            kind: .notes,
            createdAt: .now,
            content: SampleContent.tefillah
        ),
        ShiurItem(
            id: UUID(uuidString: "E29B47BC-A7FA-4F19-B1DD-07CC7755605A")!,
            title: "Yevamos Shiur 14",
            speaker: "Rav Michael Rosensweig",
            source: "YUTorah",
            duration: "1 hr 12 min",
            kind: .transcript,
            createdAt: Calendar.current.date(byAdding: .day, value: -1, to: .now) ?? .now,
            content: SampleContent.yevamos
        )
    ]
}

enum SampleContent {
    static let tefillah = """
    ## Overview

    The shiur examines the dual character of תפילה: a formal mitzvah with defined structure and an encounter of avodah shebalev, service of the heart.

    ## Central Ideas

    ### Tefillah as Avodah

    The Rambam opens Hilchos Tefillah by defining prayer as a positive commandment. The obligation is not exhausted by reciting words. It requires a person to stand before הקב״ה with awareness that prayer is itself an act of divine service.

    ### Fixed Form and Personal Expression

    Chazal established a fixed text so that every Jew can articulate praise, request, and gratitude. That structure does not eliminate individuality. Instead, it provides the framework in which personal need and communal responsibility can coexist.

    ## Key Sources

    • Rambam, Hilchos Tefillah 1:1
    • Gemara Berachos 26b
    • Gemara Taanis 2a on עבודה שבלב

    ## Practical Conclusions

    1. Preparation before prayer is part of the mitzvah rather than merely helpful advice.
    2. Understanding the structure of Shemoneh Esrei can improve concentration.
    3. Personal requests are strongest when placed within the broader language of communal tefillah.
    """

    static let yevamos = """
    The shiur begins by reviewing the relationship between the זיקה created by the death of a brother and the eventual act of יבום or חליצה.

    Rav Rosensweig distinguishes between a legal bond that exists immediately and the later mechanism that resolves that bond. This distinction helps explain several disagreements among the Rishonim concerning multiple brothers and multiple yevamos.
    """
}
