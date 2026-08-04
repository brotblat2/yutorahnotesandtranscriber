import Foundation

@MainActor
final class AppStore: ObservableObject {
    @Published var selectedTab: AppTab = .home
    @Published var path: [AppRoute] = []
    @Published var isAddSheetPresented = false
    @Published var draft = ShiurDraft()
    @Published var library = ShiurItem.samples
    @Published var generationStage: GenerationStage = .retrieving
    @Published var isGenerating = false

    private var generationTask: Task<Void, Never>?

    deinit {
        generationTask?.cancel()
    }

    func beginDraft(from choice: SourceChoice) {
        draft = ShiurDraft()

        switch choice {
        case .link, .clipboard:
            draft.source = "YUTorah"
        case .audio:
            draft.source = "Imported Audio"
            draft.sourceURL = "file://selected-audio.m4a"
            draft.title = "Imported Shiur"
            draft.speaker = "Unknown Speaker"
            draft.duration = "Audio file"
        }

        path.append(.confirmation)
    }

    func startGeneration() {
        guard !isGenerating else { return }

        isGenerating = true
        generationStage = .retrieving
        path.append(.processing)
        generationTask?.cancel()

        generationTask = Task { [weak self] in
            guard let self else { return }

            let stages: [GenerationStage] = [.retrieving, .preparing, .generating, .saving]

            for stage in stages {
                guard !Task.isCancelled else { return }
                generationStage = stage
                try? await Task.sleep(for: .milliseconds(850))
            }

            guard !Task.isCancelled else { return }

            let item = ShiurItem(
                id: UUID(),
                title: draft.title,
                speaker: draft.speaker,
                source: draft.source,
                duration: draft.duration,
                kind: draft.kind,
                createdAt: .now,
                content: draft.kind == .notes ? SampleContent.tefillah : SampleContent.yevamos
            )

            generationStage = .complete
            library.insert(item, at: 0)
            isGenerating = false

            try? await Task.sleep(for: .milliseconds(350))

            if path.last == .processing {
                path.removeLast()
            }
            path.append(.reader(item.id))
        }
    }

    func cancelGeneration() {
        generationTask?.cancel()
        generationTask = nil
        isGenerating = false
        generationStage = .retrieving

        if path.last == .processing {
            path.removeLast()
        }
    }

    func open(_ item: ShiurItem) {
        path.append(.reader(item.id))
    }

    func item(withID id: UUID) -> ShiurItem? {
        library.first { $0.id == id }
    }

    func delete(_ item: ShiurItem) {
        library.removeAll { $0.id == item.id }
    }
}
