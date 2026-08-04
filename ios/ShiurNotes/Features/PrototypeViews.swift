import SwiftUI

struct RootView: View {
    @EnvironmentObject private var store: AppStore

    var body: some View {
        NavigationStack(path: $store.path) {
            TabView(selection: $store.selectedTab) {
                HomeView()
                    .tag(AppTab.home)
                    .tabItem {
                        Label("Home", systemImage: "house")
                    }

                LibraryView()
                    .tag(AppTab.library)
                    .tabItem {
                        Label("Library", systemImage: "books.vertical")
                    }

                SettingsView()
                    .tag(AppTab.settings)
                    .tabItem {
                        Label("Settings", systemImage: "gearshape")
                    }
            }
            .tint(.shiurNavy)
            .sheet(isPresented: $store.isAddSheetPresented) {
                AddShiurSheet()
                    .environmentObject(store)
            }
            .navigationDestination(for: AppRoute.self) { route in
                switch route {
                case .confirmation:
                    ShiurConfirmationView()
                case .processing:
                    GenerationView()
                case .reader(let id):
                    if let item = store.item(withID: id) {
                        ReaderView(item: item)
                    } else {
                        ContentUnavailableView(
                            "Shiur Not Found",
                            systemImage: "doc.questionmark",
                            description: Text("This item may have been removed from your library.")
                        )
                    }
                }
            }
        }
    }
}

struct HomeView: View {
    @EnvironmentObject private var store: AppStore

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                hero

                HStack {
                    Text("Recent")
                        .font(.title3.bold())
                        .foregroundStyle(Color.shiurNavy)

                    Spacer()

                    Button("View Library") {
                        store.selectedTab = .library
                    }
                    .font(.subheadline.weight(.semibold))
                }

                if store.library.isEmpty {
                    ContentUnavailableView(
                        "No Shiurim Yet",
                        systemImage: "waveform",
                        description: Text("Add a link or audio file to create your first set of notes.")
                    )
                    .frame(maxWidth: .infinity)
                    .shiurCard()
                } else {
                    LazyVStack(spacing: 12) {
                        ForEach(Array(store.library.prefix(5))) { item in
                            Button {
                                store.open(item)
                            } label: {
                                HStack(spacing: 14) {
                                    Image(systemName: item.kind.systemImage)
                                        .font(.title3)
                                        .foregroundStyle(Color.shiurGold)
                                        .frame(width: 42, height: 42)
                                        .background(Color.shiurGold.opacity(0.12), in: Circle())

                                    ShiurMetadataView(item: item)

                                    Spacer(minLength: 4)

                                    Image(systemName: "chevron.right")
                                        .font(.caption.weight(.bold))
                                        .foregroundStyle(.tertiary)
                                }
                                .shiurCard()
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .padding(20)
        }
        .background(Color.shiurBackground.ignoresSafeArea())
        .navigationTitle("Shiur Notes")
    }

    private var hero: some View {
        VStack(alignment: .leading, spacing: 18) {
            Image(systemName: "book.pages.fill")
                .font(.system(size: 32))
                .foregroundStyle(Color.shiurGold)

            VStack(alignment: .leading, spacing: 8) {
                Text("Turn a shiur into notes you can return to.")
                    .font(.title2.bold())
                    .foregroundStyle(.white)

                Text("Share a YUTorah link or import audio, then create organized notes or a complete transcript.")
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.8))
                    .fixedSize(horizontal: false, vertical: true)
            }

            Button {
                store.isAddSheetPresented = true
            } label: {
                Label("New Shiur", systemImage: "plus")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .foregroundStyle(Color.shiurNavy)
                    .background(.white, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
            .buttonStyle(.plain)
        }
        .padding(22)
        .background(
            LinearGradient(
                colors: [Color.shiurNavy, Color.shiurNavy.opacity(0.86)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            ),
            in: RoundedRectangle(cornerRadius: 24, style: .continuous)
        )
    }
}

struct AddShiurSheet: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            VStack(spacing: 14) {
                SourceOptionButton(
                    icon: "link",
                    title: "Paste a Link",
                    subtitle: "YUTorah or Kol Halashon"
                ) {
                    select(.link)
                }

                SourceOptionButton(
                    icon: "waveform.badge.plus",
                    title: "Import Audio",
                    subtitle: "Choose an MP3, M4A, or other audio file"
                ) {
                    select(.audio)
                }

                SourceOptionButton(
                    icon: "doc.on.clipboard",
                    title: "Paste from Clipboard",
                    subtitle: "Use the shiur link currently copied"
                ) {
                    select(.clipboard)
                }

                Spacer()
            }
            .padding(20)
            .background(Color.shiurBackground.ignoresSafeArea())
            .navigationTitle("Add a Shiur")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
            }
        }
        .presentationDetents([.medium])
    }

    private func select(_ choice: SourceChoice) {
        store.beginDraft(from: choice)
        dismiss()
    }
}

private struct SourceOptionButton: View {
    let icon: String
    let title: String
    let subtitle: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 16) {
                Image(systemName: icon)
                    .font(.title2)
                    .foregroundStyle(Color.shiurGold)
                    .frame(width: 44, height: 44)
                    .background(Color.shiurGold.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))

                VStack(alignment: .leading, spacing: 4) {
                    Text(title)
                        .font(.headline)
                        .foregroundStyle(Color.shiurNavy)

                    Text(subtitle)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.leading)
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.caption.bold())
                    .foregroundStyle(.tertiary)
            }
            .shiurCard()
        }
        .buttonStyle(.plain)
    }
}

struct ShiurConfirmationView: View {
    @EnvironmentObject private var store: AppStore

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                VStack(alignment: .leading, spacing: 10) {
                    Text(store.draft.title)
                        .font(.title2.bold())
                        .foregroundStyle(Color.shiurNavy)

                    Text(store.draft.speaker)
                        .font(.headline)
                        .foregroundStyle(.secondary)

                    HStack(spacing: 8) {
                        Label(store.draft.source, systemImage: "globe")
                        Text("•")
                        Text(store.draft.duration)
                    }
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .shiurCard()

                VStack(alignment: .leading, spacing: 12) {
                    Text("Create")
                        .font(.headline)

                    Picker("Create", selection: $store.draft.kind) {
                        ForEach(GenerationKind.allCases) { kind in
                            Label(kind.title, systemImage: kind.systemImage)
                                .tag(kind)
                        }
                    }
                    .pickerStyle(.segmented)
                }

                if store.draft.kind == .notes {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Notes Detail")
                            .font(.headline)

                        Picker("Notes Detail", selection: $store.draft.detail) {
                            ForEach(NoteDetail.allCases) { detail in
                                Text(detail.title)
                                    .tag(detail)
                            }
                        }
                        .pickerStyle(.menu)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .background(Color.shiurSurface, in: RoundedRectangle(cornerRadius: 12))
                    }
                }

                VStack(alignment: .leading, spacing: 5) {
                    Label("Hebrew terms will remain in Hebrew script", systemImage: "character.book.closed")
                    Label("The result will be saved locally", systemImage: "iphone")
                }
                .font(.footnote)
                .foregroundStyle(.secondary)

                Button {
                    store.startGeneration()
                } label: {
                    Label(
                        store.draft.kind == .notes ? "Generate Notes" : "Generate Transcript",
                        systemImage: "sparkles"
                    )
                }
                .buttonStyle(PrimaryActionButtonStyle())
            }
            .padding(20)
        }
        .background(Color.shiurBackground.ignoresSafeArea())
        .navigationTitle("New Shiur")
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct GenerationView: View {
    @EnvironmentObject private var store: AppStore

    var body: some View {
        ScrollView {
            VStack(spacing: 28) {
                VStack(spacing: 10) {
                    Image(systemName: "waveform.circle.fill")
                        .font(.system(size: 62))
                        .foregroundStyle(Color.shiurGold)
                        .symbolEffect(.pulse, isActive: store.isGenerating)

                    Text(store.draft.kind == .notes ? "Creating Notes" : "Creating Transcript")
                        .font(.title2.bold())
                        .foregroundStyle(Color.shiurNavy)

                    Text(store.draft.title)
                        .font(.headline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }

                VStack(spacing: 0) {
                    ForEach(GenerationStage.allCases.filter { $0 != .complete }) { stage in
                        GenerationStageRow(stage: stage, current: store.generationStage)

                        if stage != .saving {
                            Divider()
                                .padding(.leading, 48)
                        }
                    }
                }
                .shiurCard()

                Text("You can leave this screen while the app continues working. A production build will restore interrupted jobs and notify you when the result is ready.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)

                Button(role: .cancel) {
                    store.cancelGeneration()
                } label: {
                    Text("Cancel Generation")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
            }
            .padding(20)
        }
        .background(Color.shiurBackground.ignoresSafeArea())
        .navigationBarBackButtonHidden(true)
    }
}

private struct GenerationStageRow: View {
    let stage: GenerationStage
    let current: GenerationStage

    var body: some View {
        HStack(spacing: 14) {
            Group {
                if stage.rawValue < current.rawValue {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                } else if stage == current {
                    ProgressView()
                        .tint(Color.shiurGold)
                } else {
                    Image(systemName: "circle")
                        .foregroundStyle(.tertiary)
                }
            }
            .frame(width: 28, height: 28)

            Text(stage.title)
                .font(.subheadline.weight(stage == current ? .semibold : .regular))
                .foregroundStyle(stage.rawValue <= current.rawValue ? Color.primary : Color.secondary)

            Spacer()
        }
        .padding(.vertical, 13)
    }
}

private enum LibraryFilter: String, CaseIterable, Identifiable {
    case all = "All"
    case notes = "Notes"
    case transcripts = "Transcripts"

    var id: Self { self }
}

struct LibraryView: View {
    @EnvironmentObject private var store: AppStore
    @State private var query = ""
    @State private var filter: LibraryFilter = .all

    private var filteredItems: [ShiurItem] {
        store.library.filter { item in
            let matchesQuery = query.isEmpty ||
                item.title.localizedCaseInsensitiveContains(query) ||
                item.speaker.localizedCaseInsensitiveContains(query) ||
                item.content.localizedCaseInsensitiveContains(query)

            let matchesFilter: Bool
            switch filter {
            case .all:
                matchesFilter = true
            case .notes:
                matchesFilter = item.kind == .notes
            case .transcripts:
                matchesFilter = item.kind == .transcript
            }

            return matchesQuery && matchesFilter
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            Picker("Filter", selection: $filter) {
                ForEach(LibraryFilter.allCases) { option in
                    Text(option.rawValue)
                        .tag(option)
                }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)

            if filteredItems.isEmpty {
                ContentUnavailableView.search(text: query)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List {
                    ForEach(filteredItems) { item in
                        Button {
                            store.open(item)
                        } label: {
                            HStack(spacing: 14) {
                                Image(systemName: item.kind.systemImage)
                                    .foregroundStyle(Color.shiurGold)
                                    .frame(width: 32)

                                ShiurMetadataView(item: item)

                                Spacer()
                            }
                            .padding(.vertical, 5)
                        }
                        .buttonStyle(.plain)
                        .listRowBackground(Color.shiurSurface)
                        .swipeActions(edge: .trailing) {
                            Button(role: .destructive) {
                                store.delete(item)
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                        }
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
            }
        }
        .background(Color.shiurBackground.ignoresSafeArea())
        .navigationTitle("Library")
        .searchable(text: $query, prompt: "Search notes, rabbis, or topics")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    store.isAddSheetPresented = true
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
    }
}

struct ReaderView: View {
    let item: ShiurItem

    @State private var isPlaying = false
    @State private var showRefineInfo = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                VStack(alignment: .leading, spacing: 10) {
                    Text(item.title)
                        .font(.largeTitle.bold())
                        .foregroundStyle(Color.shiurNavy)

                    Text(item.speaker)
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(.secondary)

                    HStack(spacing: 7) {
                        Text(item.source)
                        Text("•")
                        Text(item.kind.title)
                        Text("•")
                        Text(item.dateLabel)
                    }
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                }

                Button {
                    isPlaying.toggle()
                } label: {
                    Label(isPlaying ? "Pause Shiur" : "Listen to Shiur", systemImage: isPlaying ? "pause.fill" : "play.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(Color.shiurNavy)

                Divider()

                Text(item.content)
                    .font(.system(size: 17))
                    .lineSpacing(7)
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(20)
            .padding(.bottom, 64)
        }
        .background(Color.shiurBackground.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    ShareLink(item: item.content) {
                        Label("Share", systemImage: "square.and.arrow.up")
                    }

                    Button {
                        showRefineInfo = true
                    } label: {
                        Label("Refine with AI", systemImage: "sparkles")
                    }

                    Button {
                    } label: {
                        Label("Export PDF", systemImage: "doc.richtext")
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
        }
        .safeAreaInset(edge: .bottom) {
            HStack {
                Button {
                    isPlaying.toggle()
                } label: {
                    Label("Listen", systemImage: isPlaying ? "pause.fill" : "play.fill")
                }

                Spacer()

                ShareLink(item: item.content) {
                    Label("Share", systemImage: "square.and.arrow.up")
                }

                Spacer()

                Button {
                    showRefineInfo = true
                } label: {
                    Label("Refine", systemImage: "sparkles")
                }
            }
            .font(.subheadline.weight(.semibold))
            .padding(.horizontal, 24)
            .padding(.vertical, 14)
            .background(.ultraThinMaterial)
        }
        .alert("AI Refinements", isPresented: $showRefineInfo) {
            Button("OK", role: .cancel) {}
        } message: {
            Text("Enhancement, translation, and concise versions will be wired after the core generation pipeline.")
        }
    }
}

struct SettingsView: View {
    @State private var defaultKind: GenerationKind = .notes
    @State private var detail: NoteDetail = .comprehensive
    @State private var keepScreenAwake = false

    var body: some View {
        List {
            Section("AI") {
                NavigationLink {
                    APIKeySettingsView()
                } label: {
                    Label("Gemini API Key", systemImage: "key")
                }

                Picker("Default Output", selection: $defaultKind) {
                    ForEach(GenerationKind.allCases) { kind in
                        Text(kind.title)
                            .tag(kind)
                    }
                }

                Picker("Notes Detail", selection: $detail) {
                    ForEach(NoteDetail.allCases) { option in
                        Text(option.title)
                            .tag(option)
                    }
                }
            }

            Section("Reading") {
                Toggle(isOn: $keepScreenAwake) {
                    Label("Keep Screen Awake", systemImage: "sun.max")
                }

                NavigationLink {
                    Text("Text size and appearance controls will be added with the reader polish pass.")
                        .padding()
                        .navigationTitle("Appearance")
                } label: {
                    Label("Appearance", systemImage: "textformat.size")
                }
            }

            Section("Data") {
                Label("Export Library", systemImage: "square.and.arrow.up")
                Label("Import Backup", systemImage: "square.and.arrow.down")
                Label("Storage Usage", systemImage: "internaldrive")
            }

            Section("Privacy") {
                NavigationLink {
                    VStack(alignment: .leading, spacing: 16) {
                        Text("Private by design")
                            .font(.title.bold())
                        Text("The production app will keep notes on device, store personal API keys in Keychain, and send audio directly to the configured AI provider.")
                            .foregroundStyle(.secondary)
                        Spacer()
                    }
                    .padding()
                    .navigationTitle("Privacy")
                } label: {
                    Label("How Your Data Is Handled", systemImage: "hand.raised")
                }
            }

            Section("About") {
                LabeledContent("Version", value: "0.1.0 Prototype")
                Link(destination: URL(string: "https://github.com/brotblat2/yutorahnotesandtranscriber")!) {
                    Label("GitHub", systemImage: "chevron.left.forwardslash.chevron.right")
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.shiurBackground.ignoresSafeArea())
        .navigationTitle("Settings")
    }
}

private struct APIKeySettingsView: View {
    @State private var key = ""
    @State private var status = "No key saved in this prototype."

    var body: some View {
        Form {
            Section {
                SecureField("Paste Gemini API key", text: $key)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()

                Button("Test Connection") {
                    status = key.isEmpty ? "Enter a key first." : "Connection testing will be added with the Gemini client."
                }

                Button("Save Key") {
                    status = key.isEmpty ? "Enter a key first." : "Keychain storage is the next implementation step."
                }
                .disabled(key.isEmpty)
            } footer: {
                Text("The finished app will store this value in iOS Keychain. It will never be committed to the repository.")
            }

            Section("Status") {
                Text(status)
                    .foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Gemini API Key")
        .navigationBarTitleDisplayMode(.inline)
    }
}
