import SwiftUI

extension Color {
    static let shiurBackground = Color(red: 0.975, green: 0.965, blue: 0.93)
    static let shiurSurface = Color(red: 1.0, green: 0.995, blue: 0.98)
    static let shiurNavy = Color(red: 0.08, green: 0.16, blue: 0.27)
    static let shiurGold = Color(red: 0.68, green: 0.50, blue: 0.18)
    static let shiurSecondaryText = Color.secondary
}

struct PrimaryActionButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 15)
            .foregroundStyle(.white)
            .background(Color.shiurNavy, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .opacity(configuration.isPressed ? 0.78 : 1)
            .scaleEffect(configuration.isPressed ? 0.99 : 1)
    }
}

struct ShiurCardModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(16)
            .background(Color.shiurSurface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(Color.shiurNavy.opacity(0.08), lineWidth: 1)
            }
    }
}

extension View {
    func shiurCard() -> some View {
        modifier(ShiurCardModifier())
    }
}

struct ShiurMetadataView: View {
    let item: ShiurItem

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(item.title)
                .font(.headline)
                .foregroundStyle(Color.shiurNavy)
                .lineLimit(2)

            Text(item.speaker)
                .font(.subheadline)
                .foregroundStyle(.secondary)

            HStack(spacing: 6) {
                Label(item.kind.title, systemImage: item.kind.systemImage)
                Text("•")
                Text(item.duration)
                Text("•")
                Text(item.dateLabel)
            }
            .font(.caption)
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }
    }
}
