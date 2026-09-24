package easrpa;

import com.sun.tools.attach.VirtualMachine;

public final class AttachHelper {
    public static void main(String[] args) throws Exception {
        VirtualMachine vm = VirtualMachine.attach(args[0]);
        try { vm.loadAgent(args[1], args[2]); }
        finally { vm.detach(); }
    }
}
