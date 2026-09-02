"""
Capa de ofuscacion bidireccional para Gnosis AI.
Ofusca: factura, chasis (VIN), pedimento, patente (identificadores transaccionales).
NO ofusca: marca, tipo, pais, precio, j_y_n, fechas, totales.
"""

import hashlib
import re

# VIN ISO 3779: 17 caracteres, sin I/O/Q. Un valor con esta forma es un
# chasis aunque venga bajo un alias o expresión (SELECT chasis AS x).
_VIN_RE = re.compile(r'^[A-HJ-NPR-Z0-9]{17}$')


class ObfuscationLayer:
    """Mantiene mapeo bidireccional real <-> token para una conversacion."""

    def __init__(self, semilla: str = ""):
        self._real_to_token = {}  # valor_real -> token
        self._token_to_real = {}  # token -> valor_real
        # La semilla (el id del hilo de chat) hace el token DETERMINISTA: dos
        # procesos distintos —gunicorn corre varios workers— derivan el mismo
        # token para el mismo valor, asi que uno puede revertir la historia
        # que escribio el otro. Con uuid4 y un contador de proceso, el segundo
        # worker leia tokens que no sabia resolver.
        self.semilla = semilla or ""

    def _make_token(self, prefix, value):
        corto = hashlib.sha256(
            f"{self.semilla}|{value}".encode("utf-8")).hexdigest()[:8].upper()
        return f"[{prefix}-{corto}]"

    def precargar(self, identificadores: dict) -> None:
        """Siembra el mapa con los identificadores conocidos de la sesion.

        Necesario al RECONSTRUIR una conversacion desde SQLite: el texto
        guardado lleva tokens, y sin este mapa `unmask_text` no sabria
        devolverle al operador el valor real."""
        for valor, tipo in identificadores.items():
            self.mask_value(valor, tipo)

    def mask_value(self, value, field_type):
        """Ofusca un valor segun su tipo. Retorna el token."""
        if not value or str(value).strip() == '':
            return value

        value_str = str(value).strip()
        if value_str in self._real_to_token:
            return self._real_to_token[value_str]

        prefix_map = {
            'factura': 'FACT',
            'chasis': 'VIN',
            'pedimento': 'PED',
            'patente': 'PAT',
        }
        prefix = prefix_map.get(field_type, 'ID')
        token = self._make_token(prefix, value_str)

        self._real_to_token[value_str] = token
        self._token_to_real[token] = value_str
        return token

    def mask_row(self, row_dict):
        """Ofusca campos sensibles de un dict de resultado."""
        masked = dict(row_dict)
        sensitive_fields = {
            'factura': 'factura',
            'chasis': 'chasis',
            'numero_pedimento': 'pedimento',
            'patente': 'patente',
        }
        for field, field_type in sensitive_fields.items():
            if field in masked and masked[field]:
                masked[field] = self.mask_value(masked[field], field_type)
        # Defensa por VALOR: enmascara cualquier columna (alias/expresión)
        # cuyo contenido tenga forma de VIN, para que `SELECT chasis AS x`
        # no evada el enmascarado por nombre.
        for field, value in list(masked.items()):
            if field in sensitive_fields:
                continue
            if isinstance(value, str) and _VIN_RE.match(value.strip()):
                masked[field] = self.mask_value(value, 'chasis')
        return masked

    def mask_results(self, results):
        """Ofusca una lista de dicts."""
        return [self.mask_row(r) for r in results]

    def mask_known(self, text):
        """Inverso de `unmask_text`: vuelve a poner los tokens sobre un texto
        ya revertido. Se usa al PERSISTIR — la pantalla del operador ve el
        valor real, pero la base guarda tokens: si no, el turno siguiente lee
        el identificador en claro desde `chat_conversations`.

        Los valores mas largos primero: si uno contiene a otro, sustituir el
        corto antes romperia al largo."""
        if not text:
            return text
        for real, token in sorted(self._real_to_token.items(),
                                  key=lambda kv: len(kv[0]), reverse=True):
            text = text.replace(real, token)
        return text

    def unmask_text(self, text):
        """Reemplaza todos los tokens en un texto con sus valores reales."""
        if not text:
            return text
        for token, real_value in self._token_to_real.items():
            text = text.replace(token, real_value)
        return text

    def unmask_value(self, token):
        """Deofusca un token individual."""
        return self._token_to_real.get(token, token)

    def resolve_input(self, user_input):
        """Si el usuario pega un valor real, lo deja pasar.
        Si pega un token, lo resuelve al valor real."""
        if user_input in self._token_to_real:
            return self._token_to_real[user_input]
        return user_input
