package cl.nmunoz.cubitos;

import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;

/**
 * El juego corre entero en el WebView. Lo nativo se limita a tres cosas que la
 * web no puede garantizar dentro de un APK:
 *
 *  - la pantalla no se apaga mientras se juega (FLAG_KEEP_SCREEN_ON, por si el
 *    WebView no expone la Screen Wake Lock API);
 *  - se dibuja bajo la muesca; el CSS del juego ya respeta env(safe-area-inset-*),
 *    asi que ningun boton queda debajo;
 *  - las barras de sistema quedan ocultas en modo inmersivo pegajoso, para que
 *    un dedo apoyado en el borde no saque al nino del juego.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            getWindow().getAttributes().layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }

        hideSystemBars();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        // Al volver de una notificacion las barras reaparecen: se vuelven a ocultar.
        if (hasFocus) {
            hideSystemBars();
        }
    }

    private void hideSystemBars() {
        View decor = getWindow().getDecorView();
        decor.setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }
}
