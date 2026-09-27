package easrpa;

import java.awt.Component;
import java.awt.Container;
import java.awt.Window;
import java.io.File;
import java.io.PrintWriter;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.lang.instrument.Instrumentation;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import javax.swing.JComboBox;
import javax.swing.AbstractButton;
import javax.swing.JPasswordField;
import javax.swing.JTextField;
import javax.swing.SwingUtilities;

public final class DataCenterAgent {
    public static void agentmain(final String outputPath, Instrumentation instrumentation) {
        try {
            SwingUtilities.invokeAndWait(new Runnable() {
                public void run() {
                    try {
                        List<String> lines = Files.exists(Paths.get(outputPath)) ? Files.readAllLines(Paths.get(outputPath), StandardCharsets.UTF_8) : new ArrayList<String>();
                        if (!lines.isEmpty() && "LOGIN".equals(lines.get(0))) login(lines);
                        else writeOptions(outputPath);
                    } catch (Exception error) { writeError(outputPath, error.getClass().getSimpleName()); }
                }
            });
        } catch (Exception error) {
            writeError(outputPath, error.getClass().getSimpleName());
        }
    }

    private static boolean insideCombo(Component component) {
        Container parent = component.getParent();
        while (parent != null) {
            if (parent instanceof JComboBox) return true;
            parent = parent.getParent();
        }
        return false;
    }

    private static void collectLogin(Component component, List<JComboBox<?>> combos, List<JTextField> fields, List<AbstractButton> buttons) {
        if (!component.isVisible()) return;
        if (component instanceof JComboBox) combos.add((JComboBox<?>) component);
        if (component instanceof JTextField && !(component instanceof JPasswordField) && !insideCombo(component)) fields.add((JTextField) component);
        if (component instanceof AbstractButton) buttons.add((AbstractButton) component);
        if (component instanceof Container) for (Component child : ((Container) component).getComponents()) collectLogin(child, combos, fields, buttons);
    }

    private static String decode(String value) { return new String(Base64.getDecoder().decode(value), StandardCharsets.UTF_8); }

    private static void login(List<String> lines) {
        String outputPath = decode(lines.get(1));
        try {
            String dataCenter = decode(lines.get(2));
            String username = decode(lines.get(3));
            char[] password = decode(lines.get(4)).toCharArray();
            List<JComboBox<?>> combos = new ArrayList<JComboBox<?>>();
            List<JTextField> fields = new ArrayList<JTextField>();
            List<AbstractButton> buttons = new ArrayList<AbstractButton>();
            for (Window window : Window.getWindows()) if (window.isShowing()) collectLogin(window, combos, fields, buttons);
            JComboBox<?> targetCombo = null;
            int targetIndex = -1;
            Object targetItem = null;
            for (JComboBox<?> combo : combos) {
                for (int i = 0; i < combo.getItemCount(); i++) {
                    Object item = combo.getItemAt(i);
                    if (dataCenter.equals(String.valueOf(item))) {
                        targetCombo = combo;
                        targetIndex = i;
                        targetItem = item;
                        break;
                    }
                }
                if (targetCombo != null) break;
            }
            if (targetCombo == null) { writeError(outputPath, "DATACENTER_NOT_FOUND"); return; }
            targetCombo.setSelectedIndex(targetIndex);
            targetCombo.setSelectedItem(targetItem);
            if (!dataCenter.equals(String.valueOf(targetCombo.getSelectedItem()))) { writeError(outputPath, "DATACENTER_VERIFY_FAILED"); return; }
            JTextField usernameField = null;
            JPasswordField passwordField = null;
            for (JTextField field : fields) if (field.isEditable() && field.isEnabled()) usernameField = field;
            for (Window window : Window.getWindows()) if (window.isShowing()) passwordField = findPassword(window, passwordField);
            AbstractButton loginButton = null;
            for (AbstractButton button : buttons) if (button.isEnabled() && button.getText() != null && button.getText().contains("登录")) loginButton = button;
            if (usernameField == null) { writeError(outputPath, "USERNAME_FIELD_NOT_FOUND"); return; }
            if (passwordField == null) { writeError(outputPath, "PASSWORD_FIELD_NOT_FOUND"); return; }
            if (loginButton == null) { writeError(outputPath, "LOGIN_BUTTON_NOT_FOUND"); return; }
            usernameField.setText(username);
            if (!username.equals(usernameField.getText())) { writeError(outputPath, "USERNAME_VERIFY_FAILED"); return; }
            passwordField.setText(new String(password));
            java.util.Arrays.fill(password, '\0');
            PrintWriter writer = new PrintWriter(outputPath, StandardCharsets.UTF_8.name());
            writer.println("SUBMITTED"); writer.close();
            loginButton.doClick();
        } catch (Exception error) { writeError(outputPath, error.getClass().getSimpleName()); }
    }

    private static JPasswordField findPassword(Component component, JPasswordField found) {
        if (component instanceof JPasswordField && component.isVisible() && component.isEnabled()) found = (JPasswordField) component;
        if (component instanceof Container) for (Component child : ((Container) component).getComponents()) found = findPassword(child, found);
        return found;
    }

    private static void collect(Component component, List<JComboBox<?>> combos) {
        if (component instanceof JComboBox) combos.add((JComboBox<?>) component);
        if (component instanceof Container) {
            for (Component child : ((Container) component).getComponents()) collect(child, combos);
        }
    }

    private static void writeOptions(String outputPath) {
        List<JComboBox<?>> combos = new ArrayList<JComboBox<?>>();
        for (Window window : Window.getWindows()) if (window.isShowing()) collect(window, combos);
        JComboBox<?> best = null;
        int bestScore = -1;
        for (JComboBox<?> combo : combos) {
            int score = combo.getItemCount();
            for (int i = 0; i < combo.getItemCount(); i++) {
                String text = String.valueOf(combo.getItemAt(i));
                if (text.toLowerCase().contains("eas")) score += 20;
            }
            if (score > bestScore) { best = combo; bestScore = score; }
        }
        try {
            PrintWriter writer = new PrintWriter(new File(outputPath), StandardCharsets.UTF_8.name());
            if (best == null) writer.println("ERROR:COMBO_NOT_FOUND");
            else for (int i = 0; i < best.getItemCount(); i++) {
                String value = String.valueOf(best.getItemAt(i));
                writer.println(Base64.getEncoder().encodeToString(value.getBytes(StandardCharsets.UTF_8)));
            }
            writer.close();
        } catch (Exception ignored) { }
    }

    private static void writeError(String outputPath, String message) {
        try { PrintWriter writer = new PrintWriter(outputPath, "UTF-8"); writer.println("ERROR:" + message); writer.close(); }
        catch (Exception ignored) { }
    }
}
